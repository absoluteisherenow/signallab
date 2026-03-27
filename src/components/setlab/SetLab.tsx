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

export function SetLab() {
  const [activeTab, setActiveTab] = useState<'library' | 'builder' | 'history'>('library')
  const [library, setLibrary] = useState<Track[]>(SAMPLE_LIBRARY)
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
  const audioInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)

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

  useEffect(() => { loadPastSets() }, [])

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
          {(['library', 'builder', 'history'] as const).map(tab => (
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
                  <div style={{ fontSize: '13px', color: dragOver ? s.setlab : s.dim, marginBottom: '4px' }}>
                    {dragOver ? 'Drop audio files here' : 'Drop MP3, WAV, or FLAC files here — or click to browse'}
                  </div>
                  <div style={{ fontSize: '10px', color: s.dimmer }}>
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
      </div>

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
