'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { analyseAudioFile, type AudioAnalysisResult } from '@/lib/audioAnalysis'
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

// ── AIFF chunked reader ────────────────────────────────────────────────────
// Parses AIFF/AIFC headers and streams PCM in chunks — handles 1GB+ files
// without loading the full file into memory

function ieee754_80ToNumber(b: Uint8Array, o: number): number {
  const exp = ((b[o] & 0x7F) << 8) | b[o + 1]
  let m = 0; for (let i = 0; i < 8; i++) m = m * 256 + b[o + 2 + i]
  if (exp === 0 && m === 0) return 0
  return m * Math.pow(2, exp - 16383 - 63)
}

interface AIFFInfo {
  channels: number; sampleRate: number; bitDepth: number
  dataOffset: number; dataSize: number; bytesPerFrame: number
}

async function parseAIFFInfo(file: File): Promise<AIFFInfo | null> {
  const hdr = new Uint8Array(await file.slice(0, Math.min(1024 * 1024, file.size)).arrayBuffer())
  const v = new DataView(hdr.buffer)
  const t4 = (o: number) => String.fromCharCode(hdr[o], hdr[o+1], hdr[o+2], hdr[o+3])
  if (t4(0) !== 'FORM' || (t4(8) !== 'AIFF' && t4(8) !== 'AIFC')) return null
  let channels = 0, sampleRate = 0, bitDepth = 0, dataOffset = 0, dataSize = 0
  let pos = 12
  while (pos + 8 < hdr.length) {
    const id = t4(pos)
    const sz = v.getUint32(pos + 4, false)
    if (id === 'COMM') {
      channels = v.getInt16(pos + 8, false)
      bitDepth = v.getInt16(pos + 14, false)
      sampleRate = ieee754_80ToNumber(hdr, pos + 16)
    } else if (id === 'SSND') {
      const inner = v.getUint32(pos + 8, false)
      dataOffset = pos + 16 + inner
      dataSize = sz - 8 - inner
    }
    pos += 8 + sz + (sz % 2 !== 0 ? 1 : 0)
    if (id === 'SSND' && dataOffset > 0) break // found what we need
  }
  if (!channels || !sampleRate || !bitDepth || !dataOffset) return null
  const bytesPerFrame = channels * Math.ceil(bitDepth / 8)
  return { channels, sampleRate, bitDepth, dataOffset, dataSize, bytesPerFrame }
}

function pcmBigEndianToMono(raw: Uint8Array, channels: number, bitDepth: number, frames: number): Float32Array {
  const bps = Math.ceil(bitDepth / 8)
  const bpf = channels * bps
  const mono = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      const o = f * bpf + c * bps
      if (bps === 2) {
        sum += (((raw[o] << 8) | raw[o+1]) << 16 >> 16) / 32768
      } else if (bps === 3) {
        const u = (raw[o] << 16) | (raw[o+1] << 8) | raw[o+2]
        sum += (u & 0x800000 ? u - 0x1000000 : u) / 8388608
      } else if (bps === 4) {
        sum += new DataView(raw.buffer, raw.byteOffset + o, 4).getInt32(0, false) / 2147483648
      }
    }
    mono[f] = sum / channels
  }
  return mono
}

// Returns energy windows (1-second RMS) and a snippet extractor for fingerprinting
async function processAIFFChunked(
  file: File,
  info: AIFFInfo,
  onProgress?: (pct: number) => void
): Promise<{ energyWindows: number[]; getSnippet: (startSec: number, durSec: number) => Promise<Float32Array> }> {
  const CHUNK_BYTES = 8 * 1024 * 1024 // 8MB per chunk
  const { channels, sampleRate, bitDepth, dataOffset, dataSize, bytesPerFrame } = info
  const windowFrames = sampleRate // 1-second RMS windows
  const windowBytes = windowFrames * bytesPerFrame
  const energyWindows: number[] = []
  let pending = new Uint8Array(0)
  let processed = 0

  for (let offset = dataOffset; offset < dataOffset + dataSize; offset += CHUNK_BYTES) {
    const sliceEnd = Math.min(offset + CHUNK_BYTES, dataOffset + dataSize)
    const raw = new Uint8Array(await file.slice(offset, sliceEnd).arrayBuffer())
    // prepend any partial window from last chunk
    const combined = new Uint8Array(pending.length + raw.length)
    combined.set(pending); combined.set(raw, pending.length)
    // process complete windows
    let pos = 0
    while (pos + windowBytes <= combined.length) {
      const frames = windowFrames
      let sum = 0
      const bps = Math.ceil(bitDepth / 8)
      const bpf = channels * bps
      for (let f = 0; f < frames; f++) {
        let s = 0
        for (let c = 0; c < channels; c++) {
          const o = pos + f * bpf + c * bps
          if (bps === 2) s += (((combined[o] << 8) | combined[o+1]) << 16 >> 16) / 32768
          else if (bps === 3) { const u = (combined[o] << 16) | (combined[o+1] << 8) | combined[o+2]; s += (u & 0x800000 ? u - 0x1000000 : u) / 8388608 }
          else if (bps === 4) s += new DataView(combined.buffer, combined.byteOffset + o, 4).getInt32(0, false) / 2147483648
        }
        sum += (s / channels) ** 2
      }
      energyWindows.push(Math.sqrt(sum / frames))
      pos += windowBytes
    }
    pending = combined.slice(pos)
    processed += sliceEnd - offset
    onProgress?.(Math.round((processed / dataSize) * 100))
  }

  const getSnippet = async (startSec: number, durSec: number): Promise<Float32Array> => {
    const startFrame = Math.floor(startSec * sampleRate)
    const numFrames = Math.floor(durSec * sampleRate)
    const startByte = dataOffset + startFrame * bytesPerFrame
    const numBytes = numFrames * bytesPerFrame
    const raw = new Uint8Array(await file.slice(startByte, startByte + numBytes).arrayBuffer())
    return pcmBigEndianToMono(raw, channels, bitDepth, Math.floor(raw.length / bytesPerFrame))
  }

  return { energyWindows, getSnippet }
}

// ── BPM estimator (shared between AIFF and decoded paths) ──────────────────
function estimateBPM(mono: Float32Array, sampleRate: number): number | null {
  if (mono.length < sampleRate * 10) return null
  const hopSize = Math.round(sampleRate / 20)
  const onsets: number[] = []
  for (let i = hopSize; i < mono.length; i += hopSize) {
    let s = 0; for (let j = 0; j < hopSize && i + j < mono.length; j++) s += mono[i + j] ** 2
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
  return bestBpm
}

// ── WAV snippet encoder — for dual fingerprinting (AudD + ACRCloud) ──────────
// ACRCloud works best at 16000 Hz mono 16-bit PCM (8000 Hz causes poor recognition)
const ACR_SAMPLE_RATE = 16000

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
  const audioInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)
  // ── Mix Scanner state ───────────────────────────────────────────────────
  const [scannerFile, setScannerFile] = useState<File | null>(null)
  const [scannerDragOver, setScannerDragOver] = useState(false)
  const [scannerTracklist, setScannerTracklist] = useState('')
  const [scannerContext, setScannerContext] = useState('')
  const [scanning, setScanning] = useState(false)
  const [acrStatus, setAcrStatus] = useState<{ok: boolean, detail: string} | null>(null)
  const [testingAcr, setTestingAcr] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState('')
  const scannerFileRef = useRef<HTMLInputElement>(null)
  const [scanPhase, setScanPhase] = useState<'upload' | 'detecting' | 'fingerprinting' | 'review' | 'analysing'>('upload')
  const [detectedTracks, setDetectedTracks] = useState<Array<{time_in: string, title: string, artist: string, confidence: number, found: boolean, source?: string, acrCode?: number, acrMsg?: string}>>([])
  const scanAudioRef = useRef<any>(null)
  const [tracklistImgParsing, setTracklistImgParsing] = useState(false)
  const tracklistImgRef = useRef<HTMLInputElement>(null)
  const [screenshotDragging, setScreenshotDragging] = useState(false)
  const [parsingScreenshot, setParsing] = useState(false)
  const [currentScanId, setCurrentScanId] = useState<string | null>(null)
  const [recentScans, setRecentScans] = useState<any[]>([])
  const [loadingScans, setLoadingScans] = useState(false)
  // RA cross-reference for scanner
  const [scannerRaMap, setScannerRaMap] = useState<Map<string, { charted_by: string; chart_title: string }>>(new Map())
  const [scannerRaLoading, setScannerRaLoading] = useState(false)
  const scannerRaFetched = useRef(false)
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
    showToast(`"${ps.name || 'Set'}" loaded into builder`, 'Set Lab')
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
      // 1. Decode / stream audio
      const isAiff = /\.aiff?$/i.test(scannerFile.name)
      let duration = 0
      let sampleRate = 44100
      let energyWindows: number[] = []
      let bpmEstimate: number | null = null
      // For fingerprinting — either a full mono buffer or a per-snippet loader
      let monoFull: Float32Array | null = null
      let aiffSnippet: ((startSec: number, durSec: number) => Promise<Float32Array>) | null = null

      if (isAiff) {
        setScanProgress('Reading AIFF header…')
        const info = await parseAIFFInfo(scannerFile)
        if (!info) throw new Error('Could not read AIFF file — check it is a valid AIFF/AIFC')
        sampleRate = Math.round(info.sampleRate)
        duration = info.dataSize / info.bytesPerFrame / sampleRate
        setScanProgress('Reading mix…')
        const aiff = await processAIFFChunked(scannerFile, info, pct => setScanProgress(`Reading mix… ${pct}%`))
        energyWindows = aiff.energyWindows
        aiffSnippet = aiff.getSnippet
        // BPM from 60s middle window
        const midSec = Math.max(0, duration / 2 - 30)
        const bmpMono = await aiff.getSnippet(midSec, Math.min(60, duration - midSec))
        bpmEstimate = estimateBPM(bmpMono, sampleRate)
      } else {
        setScanProgress('Reading mix…')
        const arrayBuffer = await scannerFile.arrayBuffer()
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const audioCtx = new AudioCtx()
        let decoded: AudioBuffer
        try {
          decoded = await audioCtx.decodeAudioData(arrayBuffer)
        } catch {
          throw new Error('Could not decode audio — try MP3, WAV, AIFF, or FLAC')
        }
        audioCtx.close()
        duration = decoded.duration
        sampleRate = decoded.sampleRate
        setScanProgress('Reading mix…')
        const mono = new Float32Array(decoded.length)
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c)
          for (let i = 0; i < decoded.length; i++) mono[i] += ch[i] / decoded.numberOfChannels
        }
        monoFull = mono
        const windowSize = sampleRate
        for (let i = 0; i < mono.length; i += windowSize) {
          let sum = 0; const end = Math.min(i + windowSize, mono.length)
          for (let j = i; j < end; j++) sum += mono[j] * mono[j]
          energyWindows.push(Math.sqrt(sum / (end - i)))
        }
        if (duration < 7200) {
          const midStart = Math.floor((mono.length / 2) - sampleRate * 30)
          bpmEstimate = estimateBPM(mono.slice(Math.max(0, midStart), midStart + sampleRate * 60), sampleRate)
        }
      }

      // Normalise energy + detect transitions
      setScanProgress('Finding tracks…')
      const maxEnergy  = Math.max(...energyWindows) || 1
      const normEnergy = energyWindows.map(e => e / maxEnergy)
      const avgEnergy  = normEnergy.reduce((a, b) => a + b, 0) / normEnergy.length
      const peakEnergy = Math.max(...normEnergy)

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
      })).slice(0, 30)

      const results: Array<{ time_in: string; title: string; artist: string; confidence: number; found: boolean; source?: string; acrCode?: number; acrMsg?: string }> = []

      // ── Helper: get a WAV blob for a given start + duration ──────────────
      async function getWavBlob(startSec: number, durSec: number): Promise<Blob | null> {
        if (monoFull) {
          return encodeWAVSnippet(monoFull, sampleRate, Math.floor(startSec * sampleRate), Math.floor(durSec * sampleRate))
        } else if (aiffSnippet) {
          const mono = await aiffSnippet(startSec, durSec)
          return encodeWAVSnippet(mono, sampleRate, 0, mono.length)
        }
        return null
      }

      for (let i = 0; i < segments.length; i++) {
        const seg    = segments[i]
        const segLen = seg.endTime - seg.startTime

        const mm = Math.floor(seg.startTime / 60).toString().padStart(2, '0')
        const ss = Math.floor(seg.startTime % 60).toString().padStart(2, '0')
        const timeIn = `${mm}:${ss}`

        // ── Multi-position retry ─────────────────────────────────────────
        // DJs pitch-shift and time-stretch, which moves the audio fingerprint.
        // Transition zones contain two blended tracks — any sample landing there
        // will fail to match. Retrying at different positions within the segment
        // dramatically increases the chance of hitting a clean, single-track zone.
        //
        // Attempts (in order):
        //   1. Centre of the middle third (deepest into the track, cleanest)
        //   2. 65% through the segment (later, past the mix-in)
        //   3. 35% through the segment (earlier, before mix-out begins)
        //
        // Sample duration increases on each retry to give AudD more audio to work with.

        type SampleAttempt = { startRatio: number; durSec: number; label: string }
        let attempts: SampleAttempt[]

        if (segLen >= 40) {
          // Long segment — three attempts across middle zone, growing sample size
          attempts = [
            { startRatio: 0.50, durSec: Math.min(25, segLen * 0.20), label: 'centre' },
            { startRatio: 0.65, durSec: Math.min(28, segLen * 0.22), label: 'late'   },
            { startRatio: 0.35, durSec: Math.min(28, segLen * 0.22), label: 'early'  },
          ]
        } else if (segLen >= 20) {
          // Medium segment — two attempts
          attempts = [
            { startRatio: 0.50, durSec: Math.min(15, segLen * 0.40), label: 'centre' },
            { startRatio: 0.70, durSec: Math.min(15, segLen * 0.35), label: 'late'   },
          ]
        } else if (segLen >= 10) {
          // Short segment — one attempt from centre
          attempts = [
            { startRatio: 0.40, durSec: Math.min(8, segLen * 0.50), label: 'centre' },
          ]
        } else {
          // Too short — skip
          results.push({ time_in: timeIn, title: 'Unknown / White label', artist: '', confidence: 0, found: false })
          continue
        }

        let trackResult: (typeof results)[number] | null = null

        for (let a = 0; a < attempts.length; a++) {
          const attempt = attempts[a]
          if (attempt.durSec < 5) continue

          const sampleStart = seg.startTime + segLen * attempt.startRatio
          // Clamp so sample doesn't run past end of segment
          const sampleDur = Math.min(attempt.durSec, seg.endTime - sampleStart - 1)
          if (sampleDur < 5) continue

          setScanProgress(`Identifying track ${i + 1} of ${segments.length}${a > 0 ? ` (retry ${a})` : ''}…`)

          try {
            const wavBlob = await getWavBlob(sampleStart, sampleDur)
            if (!wavBlob) break

            const fd = new FormData()
            fd.append('audio', wavBlob, 'snippet.wav')
            const resp = await fetch('/api/fingerprint', { method: 'POST', body: fd })
            const data = await resp.json()

            if (data.found) {
              trackResult = { time_in: timeIn, title: data.title, artist: data.artist, confidence: data.confidence, found: true, source: data.source }
              break // found — no need to retry
            }
            // Not found — loop to next attempt position
          } catch {
            // Network error — continue to next attempt
          }
        }

        results.push(trackResult ?? { time_in: timeIn, title: 'Unknown / White label', artist: '', confidence: 0, found: false })
      }

      // ── Deduplication pass ─────────────────────────────────────────────
      // Remove consecutive fingerprint hits on the same track — happens when
      // the energy detector splits a long track or catches the same track at
      // two sample points within a 5-minute window.
      const normaliseTitle = (t: string) =>
        t.toLowerCase()
          .replace(/\(.*?\)/g, '')              // strip (Ploy Remix), (Original Mix) etc
          .replace(/remix|edit|version|mix|original|extended|radio/gi, '')
          .replace(/\s+/g, ' ').trim()
      const parseTimeSecs = (t: string) => {
        const parts = t.split(':').map(Number)
        return parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + (parts[1] || 0)
      }

      const deduped: typeof results = []
      for (const track of results) {
        if (!track.found) { deduped.push(track); continue }
        const lastFound = [...deduped].reverse().find(t => t.found)
        if (lastFound) {
          const sameArtist = lastFound.artist.toLowerCase() === track.artist.toLowerCase()
          const sameTitle  = normaliseTitle(lastFound.title) === normaliseTitle(track.title)
          const timeDiff   = parseTimeSecs(track.time_in) - parseTimeSecs(lastFound.time_in)
          if (sameArtist && sameTitle && timeDiff < 300) {
            // Same track within 5 min — suppress duplicate, mark slot unknown
            deduped.push({ ...track, found: false, title: 'Unknown / White label', artist: '', confidence: 0 })
            continue
          }
        }
        deduped.push(track)
      }

      setDetectedTracks(deduped)

      // Auto-populate the tracklist textarea
      const autoTracklist = deduped.map((t, i) =>
        `${i + 1}. ${t.time_in}  ${t.found ? `${t.artist} - ${t.title}` : 'Unknown / White label'}`
      ).join('\n')
      setScannerTracklist(autoTracklist)

      setScanPhase('review')
      setScanning(false)
      setScanProgress('')

      // Cross-reference with RA charts in background
      fetchRaForScanner(deduped)

      // Persist scan to Supabase
      try {
        const saveResp = await fetch('/api/mix-scans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: scannerFile.name,
            duration_seconds: Math.round(duration),
            bpm_estimate: bpmEstimate,
            tracklist: autoTracklist,
            detected_tracks: deduped,
            context: scannerContext.trim() || null,
            status: 'detected',
          }),
        })
        const saveData = await saveResp.json()
        if (saveData.success && saveData.scan?.id) {
          setCurrentScanId(saveData.scan.id)
        }
      } catch {
        // Non-blocking — persistence is best-effort
      }

    } catch (err: any) {
      setScanError(err.message || 'Analysis failed')
      setScanning(false)
      setScanProgress('')
      setScanPhase('upload')
    }
  }

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
    // Build tracklist from detected tracks if scannerTracklist is empty
    const tracklistText = scannerTracklist.trim()
      || detectedTracks.map((t, i) => `${i + 1}. ${t.artist ? t.artist + ' — ' : ''}${t.title}`).join('\n')

    if (!scanAudioRef.current && !tracklistText) {
      showToast('Upload a mix or add a tracklist first', 'Error')
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
          ...(scanAudioRef.current || {}),
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

  async function discoverTracks(pop = maxPopularity) {
    const seedTracks = library.length > 0 ? library : set
    if (seedTracks.length === 0) { setDiscoverError('Add some tracks to your library first'); return }
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

  useEffect(() => { loadLibrary(); loadPastSets(); fetchUpcomingGig() }, [])

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
    if (scanPhase === 'upload' || scanPhase === 'detecting' || scanPhase === 'fingerprinting') return
    try {
      localStorage.setItem(SCANNER_KEY, JSON.stringify({
        detectedTracks,
        scannerTracklist,
        scannerContext,
        scanResult: scanResult || null,
      }))
    } catch {}
  }, [scanPhase, detectedTracks, scannerTracklist, scannerContext, scanResult])

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
            }}>{tab}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 48px' }}>

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

            {/* Track library with expandable intelligence */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '12px 20px', borderBottom: `1px solid ${s.border}` }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s', cursor: 'pointer' }}
                    onClick={() => setExpandedTrack(expandedTrack === track.id ? null : track.id)}
                    onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div>
                      <div style={{ fontSize: '13px', letterSpacing: '0.05em', color: s.text }}>{track.title}</div>
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
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Past sets</div>
              {pastSets.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: s.textDimmer, fontSize: '12px' }}>
                  No past sets yet — save your first set in the Builder tab
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

            {/* Header + controls */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: s.setlab, marginBottom: '6px' }}>DISCOVER</div>
                  <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.05em', lineHeight: '1.6' }}>
                    Real tracks from Beatport × RA charts — filtered to your key, BPM, and underground depth.<br/>
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

              {/* RA-only filter toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <button
                  onClick={() => setRaOnlyFilter(f => !f)}
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

              <button
                onClick={() => discoverTracks(maxPopularity)}
                disabled={discoverLoading}
                style={{ ...btn(s.setlab), justifyContent: 'center', width: '100%', fontSize: '11px', padding: '13px' }}>
                {discoverLoading
                  ? <><ScanPulse size="sm" color={s.setlab} /> Finding rare gems...</>
                  : 'Find rare gems →'}
              </button>

              {discoverCallCount >= 8 && (
                <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(154,106,90,0.1)', border: '1px solid rgba(154,106,90,0.3)', fontSize: '10px', color: '#9a6a5a' }}>
                  ⚠ {discoverCallCount} searches this session — go easy to keep results fresh
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
                    {raOnlyFilter
                      ? `${discoverResults.filter((t: any) => t.ra_charted).length} RA charted tracks`
                      : `${discoverResults.length} matches${raChartedCount > 0 ? ` — ${raChartedCount} RA charted` : ''} — sorted rarest first`
                    }
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

                      {/* Album art */}
                      {track.album_art
                        ? <img src={track.album_art} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: '52px', height: '52px', background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: s.textDimmer }}>♫</div>
                      }

                      {/* Track info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                        <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                        {track.reason && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '3px' }}>{track.reason}</div>}
                        {track.release_year && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{track.album} · {track.release_year}</div>}
                      </div>

                      {/* Tags */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', padding: '3px 8px', background: `${popColor}20`, border: `1px solid ${popColor}50`, color: popColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{popLabel}</div>
                        {track.ra_charted && (
                          <div title={track.ra_charted_by ? `Charted by ${track.ra_charted_by}` : 'RA charted'} style={{
                            fontSize: '9px', padding: '3px 7px',
                            background: 'rgba(220,38,38,0.12)',
                            border: '1px solid rgba(220,38,38,0.35)',
                            color: '#dc2626',
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            cursor: 'default',
                            display: 'flex', alignItems: 'center', gap: '4px',
                          }}>
                            RA
                            {track.ra_charted_by && (
                              <span style={{ fontWeight: 400, letterSpacing: '0.08em', color: 'rgba(220,38,38,0.8)', fontSize: '8px' }}>
                                {track.ra_charted_by.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        )}
                        {track.camelot && <div style={{ fontSize: '11px', color: s.gold, minWidth: '32px', textAlign: 'center' }}>{track.camelot}</div>}
                        {track.bpm && <div style={{ fontSize: '11px', color: s.textDim, minWidth: '36px', textAlign: 'center' }}>{track.bpm}</div>}
                        {track.label && <div style={{ fontSize: '9px', color: s.textDimmer, letterSpacing: '0.08em', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.label}</div>}
                      </div>

                      {/* Links */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        {track.beatport_url && (
                          <a href={track.beatport_url} target="_blank" rel="noreferrer"
                            style={{ fontSize: '10px', color: s.setlab, textDecoration: 'none', letterSpacing: '0.1em', border: `1px solid ${s.setlab}40`, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                            Beatport ↗
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
                  Upload a recorded DJ mix · Breaks down transitions, energy arc and flow · Rated out of 10
                </div>
              </div>
              {scanResult && (
                <button onClick={() => { setScanResult(null); setScannerFile(null); setScanError(''); setScanPhase('upload'); setDetectedTracks([]); clearScannerState() }}
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

            {/* Screenshot import — shown when no file and no result */}
            {!scannerFile && !scanResult && scanPhase === 'upload' && (
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
                  border: `1px dashed ${screenshotDragging ? '#c9a46e' : '#2a2218'}`,
                  borderRadius: 4,
                  padding: '20px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: screenshotDragging ? 'rgba(201,164,110,0.04)' : 'transparent',
                  transition: 'all 0.15s',
                  marginBottom: 16,
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
                  <span style={{ fontSize: '11px', color: '#c9a46e', letterSpacing: '0.1em' }}>READING SCREENSHOT…</span>
                ) : (
                  <>
                    <div style={{ fontSize: '10px', color: '#5a4a38', letterSpacing: '0.15em', marginBottom: 6 }}>IMPORT FROM SCREENSHOT</div>
                    <div style={{ fontSize: '11px', color: '#3a2e1a' }}>Drop a photo of your tracklist (Traktor, Rekordbox, CDJ screen)</div>
                  </>
                )}
              </div>
            )}

            {/* Scanning progress — shown during detect, fingerprint, and analysing phases */}
            {(scanPhase === 'detecting' || scanPhase === 'fingerprinting' || scanPhase === 'analysing') && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 32px', textAlign: 'center' }}>

                {/* Animated pulse emblem */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <ScanPulse size="lg" />
                </div>

                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>
                  {scanPhase === 'detecting' ? 'Analysing mix' : scanPhase === 'fingerprinting' ? 'Identifying tracks' : 'Generating analysis'}
                </div>
                <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '4px' }}>
                  {scanPhase === 'analysing' ? 'Reading your tracklist and building feedback…' : scanProgress}
                </div>
                {scanPhase === 'fingerprinting' && detectedTracks.length > 0 && (
                  <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '8px' }}>
                    {detectedTracks.filter(t => t.found).length} of {detectedTracks.length} tracks identified so far
                  </div>
                )}
                {scanPhase === 'analysing' && (
                  <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '6px', letterSpacing: '0.08em' }}>
                    This takes 15–30 seconds
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
                  <span style={{ color: s.gold }}>Add your tracklist for the full breakdown.</span>{' '}
                  Track-by-track feedback, key mixing, curation scoring — paste it below or upload a screenshot.
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.gold, textTransform: 'uppercase' }}>
                        Tracklist <span style={{ color: s.textDimmer }}>— recommended for real analysis</span>
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
                      rows={4}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
                    />
                  </div>
                </div>

                {/* Dual fingerprint provider status */}
                {acrStatus && (
                  <div style={{
                    background: acrStatus.ok ? 'rgba(61,107,74,0.1)' : 'rgba(192,64,64,0.1)',
                    border: `1px solid ${acrStatus.ok ? 'rgba(61,107,74,0.3)' : 'rgba(192,64,64,0.3)'}`,
                    padding: '10px 16px', fontSize: '11px',
                    color: acrStatus.ok ? '#6aaa7a' : '#c06060',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span>{acrStatus.ok ? '✓' : '✗'}</span>
                    {acrStatus.detail}
                  </div>
                )}

                {/* Analyse button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                  <button
                    onClick={async () => {
                      setTestingAcr(true)
                      setAcrStatus(null)
                      try {
                        const r = await fetch('/api/fingerprint/test')
                        const d = await r.json()
                        setAcrStatus({ ok: d.ok, detail: d.detail || d.msg })
                      } catch {
                        setAcrStatus({ ok: false, detail: 'Could not reach test endpoint' })
                      }
                      setTestingAcr(false)
                    }}
                    disabled={testingAcr || scanning}
                    style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '8px 16px', border: `1px solid ${s.border}` }}>
                    {testingAcr ? 'Testing...' : 'Test connection'}
                  </button>
                  {scanning && (
                    <div style={{ fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>
                      This takes 30–60s for a long mix
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
                        {(() => {
                          const acrCount  = detectedTracks.filter(t => t.found && t.source === 'acrcloud').length
                          const auddCount = detectedTracks.filter(t => t.found && t.source === 'audd').length
                          const parts = []
                          if (acrCount > 0)  parts.push(`${acrCount} via ACRCloud`)
                          if (auddCount > 0) parts.push(`${auddCount} via AudD`)
                          return parts.length > 0
                            ? `${parts.join(', ')} — unknowns are white labels or unreleased`
                            : 'Unknown tracks are likely white labels or unreleased — edit any corrections below'
                        })()}
                      </div>
                      {detectedTracks.length > 0 && detectedTracks.filter(t => !t.found && t.acrCode !== undefined && t.acrCode !== 1001).length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '10px', color: '#c04040' }}>
                          {(() => {
                            const errTracks = detectedTracks.filter(t => !t.found && t.acrCode !== undefined && t.acrCode !== 1001)
                            const code = errTracks[0]?.acrCode
                            const msg = errTracks[0]?.acrMsg
                            if (code === 3000 || code === 3001) return `AudD auth error (${code}) — check AUDD_API_TOKEN`
                            if (code === 3003) return `AudD rate limit hit (${code}) — wait and retry`
                            return `AudD error ${code}: ${msg || 'unknown'} — check connection`
                          })()}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setScanPhase('upload'); setScannerFile(null); setDetectedTracks([]); clearScannerState() }}
                      style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '6px 12px' }}>
                      Re-upload
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                    {detectedTracks.map((t, i) => {
                      const raInfo = t.found ? getTrackRaInfo(t.artist, t.title) : null
                      return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', background: s.black, border: `1px solid ${raInfo ? 'rgba(220,38,38,0.2)' : t.found ? 'rgba(78,203,113,0.15)' : s.border}` }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer, width: '24px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ fontSize: '10px', color: s.textDimmer, width: '36px', flexShrink: 0, fontFamily: 'monospace' }}>{t.time_in}</div>
                        <div style={{ flex: 1, fontSize: '11px', color: t.found ? s.text : s.textDimmer, minWidth: 0 }}>
                          <div>{t.found ? `${t.artist} — ${t.title}` : 'Unknown / White label'}</div>
                          {raInfo && (
                            <div style={{ fontSize: '9px', color: '#dc2626', marginTop: '2px', opacity: 0.8 }}>
                              Charted by {raInfo.charted_by}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {raInfo && (
                            <div style={{ fontSize: '8px', letterSpacing: '0.1em', padding: '2px 5px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', textTransform: 'uppercase', fontWeight: 600 }}>RA</div>
                          )}
                          {t.found && t.source !== 'screenshot' && (
                            <>
                              <div style={{ fontSize: '8px', letterSpacing: '0.1em', padding: '2px 5px', background: t.source === 'acrcloud' ? 'rgba(59,130,246,0.12)' : 'rgba(176,141,87,0.1)', border: `1px solid ${t.source === 'acrcloud' ? 'rgba(59,130,246,0.3)' : 'rgba(176,141,87,0.25)'}`, color: t.source === 'acrcloud' ? '#60a5fa' : '#b08d57', textTransform: 'uppercase' }}>
                                {t.source === 'acrcloud' ? 'ACR' : 'AudD'}
                              </div>
                              <div style={{ fontSize: '9px', color: '#4ecb71', letterSpacing: '0.08em' }}>{t.confidence}%</div>
                            </>
                          )}
                          {!t.found && (
                            <div style={{ fontSize: '9px', color: s.textDimmer }}>?</div>
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
                </div>

                {/* Editable tracklist */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase' }}>
                      Edit tracklist <span style={{ opacity: 0.5 }}>— correct any wrong IDs before analysis</span>
                    </div>
                    <button
                      onClick={() => tracklistImgRef.current?.click()}
                      disabled={tracklistImgParsing}
                      style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.setlab, background: 'transparent', border: `1px solid ${s.setlab}50`, padding: '4px 10px', cursor: tracklistImgParsing ? 'wait' : 'pointer', fontFamily: s.font, opacity: tracklistImgParsing ? 0.5 : 1 }}
                    >
                      {tracklistImgParsing ? 'Reading...' : '↑ Screenshot'}
                    </button>
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
