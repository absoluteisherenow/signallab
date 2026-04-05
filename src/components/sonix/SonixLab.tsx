'use client'
import { TrackUploader } from './TrackUploader'
import { useState, useEffect, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScanPulse } from '@/components/ui/ScanPulse'
import { aiCache } from '@/lib/aiCache'

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

// ── Sonic World defaults ─────────────────────────────────────────────────
const DEFAULT_SONIC_WORLD = {
  soundsLike: [] as string[],
  key: 'A minor',
  bpm: '',
  genre: 'Electronic',
  making: '',
}

// ── Types ────────────────────────────────────────────────────────────────
interface ReferenceIntel {
  bpm: number
  key: string
  energy_arc: number[]
  techniques: { name: string; detail: string }[]
  key_sounds: string[]
  mix_notes: string
}

interface ChordVoicing {
  name: string
  notes: string
  character: string
}

interface ArrangementSection {
  name: string
  bars: number
  energy: number
  elements: string
  notes: string
}

interface AudioMeasurements {
  filename: string
  duration_ms: number
  sample_rate: number
  channels: number
  peak_db: number
  rms_db: number
  dynamic_range_db: number
  spectral_centroid_hz: number
  low_energy_ratio: number
  high_energy_ratio: number
  transient_sharpness: number
  fundamental_hz: number
  spectral_flatness: number
}

interface NextStep {
  priority: number
  area: string
  action: string
  detail: string
  plugin?: string
}

interface NextStepsResult {
  detected_type: string
  current_state: string
  next_steps: NextStep[]
  sonic_gap?: string | null
}

// ── Browser audio measurement (Cooley-Tukey FFT + acoustic analysis) ──────────

function computeFFT(realIn: Float32Array): Float32Array {
  const n = realIn.length
  const real = new Float32Array(n), imag = new Float32Array(n)
  for (let i = 0; i < n; i++) real[i] = realIn[i] * 0.5 * (1 - Math.cos((6.283185307 * i) / (n - 1)))
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const t = real[i]; real[i] = real[j]; real[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0
      for (let k = 0; k < len / 2; k++) {
        const uR = real[i+k], uI = imag[i+k]
        const vR = real[i+k+len/2]*cRe - imag[i+k+len/2]*cIm
        const vI = real[i+k+len/2]*cIm + imag[i+k+len/2]*cRe
        real[i+k] = uR+vR; imag[i+k] = uI+vI
        real[i+k+len/2] = uR-vR; imag[i+k+len/2] = uI-vI
        const nr = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nr
      }
    }
  }
  const mags = new Float32Array(n/2)
  for (let i = 0; i < n/2; i++) mags[i] = Math.sqrt(real[i]*real[i]+imag[i]*imag[i])/n
  return mags
}

function measureAudioBuffer(buf: AudioBuffer, filename: string): AudioMeasurements {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length
  const mono = new Float32Array(len)
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i]/ch }
  let peak = 0, sumSq = 0
  for (let i = 0; i < len; i++) { const a = Math.abs(mono[i]); if (a > peak) peak = a; sumSq += mono[i]*mono[i] }
  const rms = Math.sqrt(sumSq/len)
  const peak_db = peak > 1e-10 ? 20*Math.log10(peak) : -96
  const rms_db  = rms  > 1e-10 ? 20*Math.log10(rms)  : -96
  const fftSize = 16384, mid = Math.max(0, Math.floor(len/2) - fftSize/2)
  const padded = new Float32Array(fftSize); padded.set(mono.subarray(mid, mid+fftSize))
  const mags = computeFFT(padded), numBins = mags.length, binHz = sr/fftSize
  let tot = 0, ws = 0
  for (let k = 1; k < numBins; k++) { tot += mags[k]; ws += k*binHz*mags[k] }
  const centroid = tot > 0 ? ws/tot : 1000
  const lowBin = Math.ceil(200/binHz), highBin = Math.floor(4000/binHz)
  let low = 0, high = 0, all = 0
  for (let k = 1; k < numBins; k++) { const e = mags[k]*mags[k]; all += e; if (k < lowBin) low += e; if (k >= highBin) high += e }
  let logS = 0, arS = 0, vB = 0
  for (let k = 1; k < numBins; k++) { if (mags[k] > 1e-12) { logS += Math.log(mags[k]); arS += mags[k]; vB++ } }
  const flat = vB > 0 && arS > 0 ? Math.min(1, Math.exp(logS/vB)/(arS/vB)) : 0
  const fMin = Math.floor(30/binHz), fMax = Math.ceil(600/binHz)
  let fPk = 0, fBin = 1
  for (let k = fMin; k < Math.min(fMax, numBins); k++) { if (mags[k] > fPk) { fPk = mags[k]; fBin = k } }
  const envWin = Math.max(1, Math.round(sr*0.002)), nF = Math.floor(len/envWin), env = new Float32Array(nF)
  for (let f = 0; f < nF; f++) { let r = 0; for (let s = f*envWin; s < (f+1)*envWin && s < len; s++) r += mono[s]*mono[s]; env[f] = Math.sqrt(r/envWin) }
  let maxR = 0
  for (let f = 1; f < nF; f++) { const rise = env[f]-env[f-1]; if (rise > maxR) maxR = rise }
  return {
    filename, duration_ms: Math.round(buf.duration*1000), sample_rate: sr, channels: ch,
    peak_db: Math.round(peak_db*10)/10, rms_db: Math.round(rms_db*10)/10,
    dynamic_range_db: Math.round((peak_db-rms_db)*10)/10,
    spectral_centroid_hz: Math.round(centroid),
    low_energy_ratio: all > 0 ? Math.round(low/all*1000)/1000 : 0,
    high_energy_ratio: all > 0 ? Math.round(high/all*1000)/1000 : 0,
    transient_sharpness: Math.min(1, Math.round(maxR*4*1000)/1000),
    fundamental_hz: Math.round(fBin*binHz),
    spectral_flatness: Math.round(flat*1000)/1000,
  }
}

export function SonixLab() {
  const [toast, setToast] = useState<{ msg: string; tag: string } | null>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)

  // ── Mode — null = tile home, else active tool ─────────────────────────
  const [mode, setMode] = useState<null | 'reference' | 'track' | 'devices'>(null)

  // ── Sonic World (persistent) ─────────────────────────────────────────
  const [sonicWorld, setSonicWorld] = useState(DEFAULT_SONIC_WORLD)
  const [newRef, setNewRef] = useState('')

  // ── Installed plugins ────────────────────────────────────────────────
  const [installedPlugins, setInstalledPlugins] = useState<string[]>([])

  // ── Reference Intel ──────────────────────────────────────────────────
  const [refInput, setRefInput] = useState('')
  const [referenceIntel, setReferenceIntel] = useState<ReferenceIntel | null>(null)
  const [analysingRef, setAnalysingRef] = useState(false)
  const [addingToLibrary, setAddingToLibrary] = useState(false)
  const [addedToLibrary, setAddedToLibrary] = useState(false)

  // ── Composition ──────────────────────────────────────────────────────
  const [chordVoicings, setChordVoicings] = useState<ChordVoicing[]>([])
  const [motifResult, setMotifResult] = useState('')
  const [generatingChords, setGeneratingChords] = useState(false)
  const [melodyResult, setMelodyResult] = useState('')
  const [generatingMelody, setGeneratingMelody] = useState(false)

  // ── Arrangement ──────────────────────────────────────────────────────
  const [arrangeSections, setArrangeSections] = useState<ArrangementSection[]>([])
  const [arrangeExtra, setArrangeExtra] = useState<{ production_tips: string[]; key_moments: string[] } | null>(null)
  const [generatingArrange, setGeneratingArrange] = useState(false)
  const [energyArc, setEnergyArc] = useState<number[]>([])

  // ── Chains ───────────────────────────────────────────────────────────
  const [stemType, setStemType] = useState<'kick'|'bass'|'vocals'|'synths'|'drums'|'full_mix'>('full_mix')
  const [stemAnalysis, setStemAnalysis] = useState('')
  const [analysingStem, setAnalysingStem] = useState(false)

  // ── Next Steps ───────────────────────────────────────────────────────
  const [nextStepsFile, setNextStepsFile] = useState<File | null>(null)
  const [nextStepsMeasurements, setNextStepsMeasurements] = useState<AudioMeasurements | null>(null)
  const [nextStepsResult, setNextStepsResult] = useState<NextStepsResult | null>(null)
  const [generatingNextSteps, setGeneratingNextSteps] = useState(false)
  const [nextStepsDrag, setNextStepsDrag] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStepsInputRef = useRef<HTMLInputElement>(null)
  // Context questions — shown after measurement, before analysis
  const [measuringAudio, setMeasuringAudio] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [ctxGoal, setCtxGoal] = useState<string>('')           // what's this for
  const [ctxFocus, setCtxFocus] = useState<string>('')         // specific focus / problem
  const [ctxFocusCustom, setCtxFocusCustom] = useState('')     // free-text focus

  // ── Helpers ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, tag = 'Info') => {
    setToast({ msg, tag })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }, [])

  const sonicCtxString = () => {
    const parts: string[] = []
    if (sonicWorld.soundsLike.length) parts.push(`Sounds like: ${sonicWorld.soundsLike.join(' / ')}`)
    if (sonicWorld.key) parts.push(`Key: ${sonicWorld.key}`)
    if (sonicWorld.bpm) parts.push(`BPM: ${sonicWorld.bpm}`)
    if (sonicWorld.genre) parts.push(`Genre: ${sonicWorld.genre}`)
    if (sonicWorld.making) parts.push(`Making: ${sonicWorld.making}`)
    return parts.join(' · ')
  }

  const pluginCtxString = () => installedPlugins.length
    ? `Available plugins: ${installedPlugins.slice(0, 40).join(', ')}`
    : ''

  // ── Restore persisted state on mount (Sonic World + session) ─────────────
  useEffect(() => {
    const s = aiCache.get('sonix')
    if (s.sonicWorld) setSonicWorld(s.sonicWorld as typeof DEFAULT_SONIC_WORLD)
    if (s.mode) setMode(s.mode as typeof mode)
    if (s.referenceIntel) { setReferenceIntel(s.referenceIntel as ReferenceIntel); if (s.refInput) setRefInput(s.refInput as string) }
    if (s.nextStepsResult) { setNextStepsResult(s.nextStepsResult as NextStepsResult); if (s.nextStepsMeasurements) setNextStepsMeasurements(s.nextStepsMeasurements as AudioMeasurements) }
  }, [])

  useEffect(() => {
    aiCache.patch('sonix', {
      sonicWorld,
      mode,
      refInput,
      referenceIntel,
      nextStepsResult,
      nextStepsMeasurements,
    })
  }, [sonicWorld, mode, refInput, referenceIntel, nextStepsResult, nextStepsMeasurements])

  // ── Load installed plugins ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/plugins/sync')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.plugins) && d.plugins.length) setInstalledPlugins(d.plugins) })
      .catch(() => {})
  }, [])

  // ── Load sound profile from artist settings (silent, background) ──────
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const p = d.settings?.profile
      if (!p) return
      setSonicWorld(s => ({
        ...s,
        soundsLike: p.soundsLike?.length ? p.soundsLike : s.soundsLike,
        key: p.keyCenter || s.key,
        bpm: p.bpmRange?.split('–')[0] || s.bpm,
        genre: p.genre || s.genre,
        making: p.making || s.making,
      }))
    }).catch(() => {})
  }, [])

  // ── Sonic World helpers ───────────────────────────────────────────────
  function addRef() {
    const v = newRef.trim()
    if (!v || sonicWorld.soundsLike.length >= 6) return
    setSonicWorld(s => ({ ...s, soundsLike: [...s.soundsLike, v] }))
    setNewRef('')
  }

  function removeRef(i: number) {
    setSonicWorld(s => ({ ...s, soundsLike: s.soundsLike.filter((_, idx) => idx !== i) }))
  }

  // ── SONIX → SetLab pipeline ───────────────────────────────────────────
  async function addToSetLabLibrary() {
    if (!referenceIntel) return
    setAddingToLibrary(true)
    try {
      const raw = refInput.trim()
      let title = raw, artist = ''
      if (raw.includes('—')) { [artist, title] = raw.split('—').map(s => s.trim()) }
      else if (raw.includes(' - ')) { [artist, title] = raw.split(' - ').map(s => s.trim()) }
      else { title = raw }

      const CAMELOT_MAP: Record<string, string> = {
        'C major': '8B', 'G major': '9B', 'D major': '10B', 'A major': '11B', 'E major': '12B',
        'B major': '1B', 'F# major': '2B', 'Db major': '3B', 'Ab major': '4B', 'Eb major': '5B',
        'Bb major': '6B', 'F major': '7B', 'A minor': '8A', 'E minor': '9A', 'B minor': '10A',
        'F# minor': '11A', 'C# minor': '12A', 'G# minor': '1A', 'D# minor': '2A', 'A# minor': '3A',
        'F minor': '4A', 'C minor': '5A', 'G minor': '6A', 'D minor': '7A',
      }
      const camelot = CAMELOT_MAP[referenceIntel.key] || ''
      const arc = referenceIntel.energy_arc || []
      const energy = arc.length ? Math.min(10, Math.max(1, Math.round(arc.reduce((a: number, b: number) => a + b, 0) / arc.length))) : 6
      const producerNotes = [
        ...(referenceIntel.techniques || []).map((t: any) => `${t.name}: ${t.detail}`),
        ...(referenceIntel.key_sounds || []),
      ].join(' · ')

      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist, bpm: referenceIntel.bpm, key: referenceIntel.key, camelot, energy, notes: referenceIntel.mix_notes, producer_style: producerNotes, source: 'sonix_reference' }),
      })
      if (!res.ok) throw new Error('Failed')
      setAddedToLibrary(true)
      showToast(`${title} added to SetLab library`, 'Done')
    } catch { showToast('Could not add to library', 'Error') }
    finally { setAddingToLibrary(false) }
  }

  // ── Reference Intel ───────────────────────────────────────────────────
  async function analyseReference(trackOverride?: string) {
    const track = trackOverride ?? refInput
    if (!track.trim()) { showToast('Enter a track name first', 'Error'); return }
    if (trackOverride) setRefInput(trackOverride)
    setAnalysingRef(true)
    setReferenceIntel(null)
    setAddedToLibrary(false)
    try {
      const raw = await callClaude(
        `You are an expert music analyst with encyclopedic knowledge of electronic music. Return ONLY valid JSON, no markdown, no extra text before or after the JSON object.`,
        `Analyse this track for a producer who wants to work in a similar sonic world: "${track}"

Return ONLY this JSON object (no markdown, no preamble):
{
  "bpm": <number — actual BPM of this track>,
  "key": "<actual key, e.g. 'A minor'>",
  "energy_arc": [<array of 6-8 energy values 1-10 representing the track arc from start to end>],
  "techniques": [
    { "name": "<technique name>", "detail": "<specific setting or approach — exact frequencies, ratios, plugin names if known>"},
    { "name": "<technique name>", "detail": "<specific detail>" },
    { "name": "<technique name>", "detail": "<specific detail>" }
  ],
  "key_sounds": ["<sound element 1>", "<sound element 2>", "<sound element 3>", "<sound element 4>"],
  "mix_notes": "<One sentence on the mix character — low end approach, mid range, high end, stereo width>"
}

Be specific. Real BPM and key. Real techniques with actual settings.`,
        1500
      )
      // Extract the outermost JSON object, tolerating any preamble/postamble text
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON in response')
      let parsed: ReferenceIntel
      try {
        parsed = JSON.parse(jsonMatch[0]) as ReferenceIntel
      } catch {
        // Truncated — try closing it
        try {
          const attempt = jsonMatch[0] + '"}}'
          parsed = JSON.parse(attempt) as ReferenceIntel
        } catch {
          throw new Error('Response too malformed to repair')
        }
      }
      if (!parsed.techniques) parsed.techniques = []
      if (!parsed.key_sounds) parsed.key_sounds = []
      if (!parsed.energy_arc) parsed.energy_arc = [5, 5, 6, 7, 7, 6]
      setReferenceIntel(parsed)
      // Auto-populate Sonic World
      if (parsed.key) setSonicWorld(s => ({ ...s, key: parsed.key }))
      if (parsed.bpm) setSonicWorld(s => ({ ...s, bpm: String(parsed.bpm) }))
      showToast('Reference analysed', 'Done')
    } catch {
      showToast('Analysis failed — response malformed, try again', 'Error')
    } finally {
      setAnalysingRef(false)
    }
  }

  // ── Composition: Chords ───────────────────────────────────────────────
  async function generateChords() {
    setGeneratingChords(true)
    setChordVoicings([])
    setMotifResult('')
    try {
      const refCtx = referenceIntel
        ? `Reference track key sounds: ${referenceIntel.key_sounds.join(', ')}. Mix character: ${referenceIntel.mix_notes}.`
        : ''
      const raw = await callClaude(
        `You are a music theory translator for electronic music producers. Your job is to take a producer's creative intent and give them the actual notes — no theory labels, no Roman numerals, just playable information. The creative decisions are already made by the producer. You are removing theory as a blocker, not making creative choices. Return ONLY valid JSON, no markdown.`,
        `The producer has already decided what they are making: "${sonicWorld.making || sonicWorld.genre || 'electronic music'}"
Key they are working in: ${sonicWorld.key || 'A minor'}
Genre: ${sonicWorld.genre}
${sonicWorld.soundsLike.length ? `Their reference artists: ${sonicWorld.soundsLike.join(', ')}` : ''}
${refCtx}

Translate their key into actual chord voicings they can play directly — chords that work in this key and fit the genre and references they have already chosen. Also surface one interval pattern common in this style that they could use as a starting point to react against.

Return JSON:
{
  "voicings": [
    { "name": "<chord name>", "notes": "<actual note names with octave, e.g. 'A2 · E3 · A3 · C4 · E4'>", "character": "<one sentence on where this sits in the genre — what context it appears in>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<context>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<context>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<context>" }
  ],
  "motif": "<An interval pattern common in this style — describe with actual note names and directions, e.g. 'A3, up to C4, down to G3, hold 2 beats'. This is a reference pattern from the genre, not a prescription.>"
}

Real note names only. No Roman numerals. No theory labels. Notes the producer can play directly.`,
        600
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setChordVoicings(parsed.voicings || [])
      setMotifResult(parsed.motif || '')
      showToast('Voicings generated', 'Done')
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingChords(false)
    }
  }

  // ── Composition: Melody ───────────────────────────────────────────────
  async function generateMelody() {
    setGeneratingMelody(true)
    setMelodyResult('')
    try {
      const raw = await callClaude(
        `You are a melody composer for electronic music. Give specific actionable note suggestions. No Roman numerals. No theory labels.`,
        `Key: ${sonicWorld.key || 'A minor'}
Genre: ${sonicWorld.genre}
${sonicWorld.soundsLike.length ? `Sounds like: ${sonicWorld.soundsLike.join(', ')}` : ''}
${chordVoicings.length ? `Underlying chords: ${chordVoicings.map(c => `${c.name} (${c.notes})`).join(' → ')}` : ''}
${sonicWorld.making ? `Making: ${sonicWorld.making}` : ''}

Give me:
1. A specific melodic motif — describe with actual interval directions and note names (e.g. "start on A3, up to C4, down to G3, hold 2 beats")
2. Two variations using different rhythms or start points
3. A counter-melody idea using actual notes
4. Scale/mode extensions beyond the obvious (e.g. "use the Dorian b2 for tension on bar 4")
5. How producers like ${sonicWorld.soundsLike.slice(0,2).join(', ') || 'Bicep, Four Tet'} typically approach melody in this register`,
        500
      )
      setMelodyResult(raw.replace(/\*\*/g,'').replace(/^#{1,3} /gm,''))
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingMelody(false)
    }
  }

  // ── Arrangement ───────────────────────────────────────────────────────
  async function generateArrangement() {
    setGeneratingArrange(true)
    setArrangeSections([])
    setArrangeExtra(null)
    setEnergyArc([])
    try {
      const refIntelCtx = referenceIntel
        ? `Reference energy arc: [${referenceIntel.energy_arc.join(', ')}]. Reference techniques: ${referenceIntel.techniques.map(t => t.name).join(', ')}.`
        : ''
      const raw = await callClaude(
        `You are a structural analyst for electronic music. Your job is to show how tracks in a given genre and style are typically structured — derived from the producer's own reference artists and intent. You are providing a framework based on how their references work, not making creative decisions. The producer decides what to do with this information. Return ONLY valid JSON, no markdown.`,
        `The producer is making: ${sonicWorld.making || sonicWorld.genre + ' track'}
Key: ${sonicWorld.key}
BPM: ${sonicWorld.bpm || '130'}
Genre: ${sonicWorld.genre}
${sonicWorld.soundsLike.length ? `Their reference artists: ${sonicWorld.soundsLike.join(', ')}` : ''}
${refIntelCtx}

Based on how tracks in this genre and by these reference artists are typically structured, provide a structural framework. This is a reference map derived from the genre — the producer will adapt it to their own vision. Include what elements typically appear in each section, and what production techniques are common at each stage in this style.

Return JSON:
{
  "sections": [
    { "name": "Intro", "bars": 8, "energy": 2, "elements": "<what typically plays in this section in this genre>", "notes": "<what the reference artists typically do here>" },
    ... continue through full track including Build, Drop, Breakdown, Build 2, Drop 2, Outro
  ],
  "key_moments": ["<structural moment common in this style — e.g. 'Tension builds at bar 28 — reference artists often strip back to just percussion here'>", "<moment 2>"],
  "production_tips": ["<technique common in this genre at this stage>", "<tip 2>", "<tip 3>"]
}`,
        800
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const data = JSON.parse(cleaned)
      setArrangeSections(data.sections || [])
      setArrangeExtra({ production_tips: data.production_tips || [], key_moments: data.key_moments || [] })
      setEnergyArc((data.sections || []).map((s: ArrangementSection) => s.energy))
      showToast('Arrangement generated', 'Done')
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingArrange(false)
    }
  }

  // ── Stem analysis ─────────────────────────────────────────────────────
  async function analyseStem() {
    setAnalysingStem(true)
    setStemAnalysis('')
    try {
      const raw = await callClaude(
        `You are an expert mix engineer specialising in electronic music. ${pluginCtxString()} Give specific, immediately actionable advice — exact plugin names, exact settings, exact frequencies.`,
        `Stem: ${stemType}
${sonicCtxString() ? `Session context: ${sonicCtxString()}` : ''}
${installedPlugins.length ? `Producer's installed plugins: ${installedPlugins.slice(0,40).join(', ')}` : ''}

Give:
1. DIAGNOSIS — What to listen for, common problems with this stem type in ${sonicWorld.genre}
2. SIGNAL CHAIN — Exact plugin order, prefer installed plugins. Specific settings (EQ frequencies, ratios, times)
3. PRODUCER CHAINS — How ${sonicWorld.soundsLike.slice(0,2).join(' and ') || 'Bicep and Four Tet'} handle this stem type specifically
4. QUICK WINS — 3 moves that immediately improve this stem
5. ABLETON SPECIFIC — What native Ableton plugins cover 80% of the result`,
        800
      )
      setStemAnalysis(raw.replace(/\*\*/g,'').replace(/^#{1,3} /gm,''))
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setAnalysingStem(false)
    }
  }

  // ── Next Steps analyser ───────────────────────────────────────────────
  // Step 1: measure audio and show context questions
  async function measureAndAsk(file: File) {
    setMeasuringAudio(true)
    setNextStepsResult(null)
    setNextStepsMeasurements(null)
    setShowQuestions(false)
    setCtxGoal(''); setCtxFocus(''); setCtxFocusCustom('')
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const arrayBuf = await file.arrayBuffer()
      const audioBuf = await audioCtxRef.current.decodeAudioData(arrayBuf)
      const m = measureAudioBuffer(audioBuf, file.name)
      setNextStepsMeasurements(m)
      setShowQuestions(true)
    } catch (err: unknown) {
      showToast(`Could not read audio: ${err instanceof Error ? err.message : 'unknown error'}`, 'Error')
    } finally {
      setMeasuringAudio(false)
    }
  }

  // Step 2: run Claude with measurements + user context
  async function runAnalysisWithContext() {
    if (!nextStepsMeasurements) return
    setGeneratingNextSteps(true)
    setShowQuestions(false)
    const m = nextStepsMeasurements
    try {
      const brightnessLabel =
        m.spectral_centroid_hz < 500  ? 'very dark/muddy, lacks presence' :
        m.spectral_centroid_hz < 1200 ? 'warm and full, may lack air' :
        m.spectral_centroid_hz < 2500 ? 'balanced tonal centre' :
        m.spectral_centroid_hz < 5000 ? 'bright and present' : 'very bright, possibly thin'
      const subLabel =
        m.low_energy_ratio > 0.6 ? 'sub-dominant — risk of mud and masking' :
        m.low_energy_ratio > 0.4 ? 'healthy sub presence' : 'sub-thin, lacks low-end weight'
      const transientLabel =
        m.transient_sharpness > 0.7 ? 'very punchy/sharp attacks' :
        m.transient_sharpness > 0.4 ? 'decent transient definition' : 'soft/blunted attacks'
      const dynLabel =
        m.dynamic_range_db > 15 ? 'very dynamic, likely uncompressed' :
        m.dynamic_range_db > 8  ? 'natural dynamics' : 'heavily compressed or clipped'

      // ctxGoal now encodes both goal and stage (e.g. "Club track — early sketch")
      const userContext = [
        ctxGoal && `What I'm making: ${ctxGoal}`,
        (ctxFocusCustom || ctxFocus) && `Specific problem: ${ctxFocusCustom || ctxFocus}`,
      ].filter(Boolean).join('\n')

      const raw = await callClaude(
        `You are an expert electronic music producer and mixing engineer. The producer has told you exactly what they're going for and what stage they're at — use that to calibrate every suggestion. Don't suggest mastering moves on a sketch. Don't suggest "just keep going" on a mix-ready track. Respond ONLY with valid JSON, no markdown.`,
        `I've uploaded audio. Here's what I'm going for:

WHAT I TOLD YOU:
${userContext || 'No specific context given — give general feedback'}

SESSION CONTEXT:
${sonicCtxString() || 'Not set'}
${installedPlugins.length ? `Installed plugins: ${installedPlugins.slice(0, 40).join(', ')}` : 'Recommend Ableton stock plugins only'}

AUDIO MEASUREMENTS (from actual FFT analysis of the file):
  File: ${m.filename}
  Duration: ${(m.duration_ms / 1000).toFixed(1)}s  |  ${m.channels === 1 ? 'Mono' : 'Stereo'}  |  ${m.sample_rate}Hz
  Peak: ${m.peak_db.toFixed(1)}dBFS  |  RMS: ${m.rms_db.toFixed(1)}dBFS
  Dynamic Range: ${m.dynamic_range_db.toFixed(1)}dB → ${dynLabel}
  Spectral Centroid: ${m.spectral_centroid_hz}Hz → ${brightnessLabel}
  Low Energy (<200Hz): ${(m.low_energy_ratio * 100).toFixed(1)}% → ${subLabel}
  High Energy (>4kHz): ${(m.high_energy_ratio * 100).toFixed(1)}%
  Transient Sharpness: ${m.transient_sharpness.toFixed(3)} → ${transientLabel}
  Fundamental: ${m.fundamental_hz}Hz
  Spectral Flatness: ${m.spectral_flatness.toFixed(3)} (0=tonal, 1=noise-like)

Return JSON:
{
  "detected_type": "<what this file likely is: full mix, drum loop, bass stem, synth pad, etc>",
  "current_state": "<one sentence calibrated to the GOAL and STAGE — e.g. if it's a sketch, say what's promising; if it's mix-ready, say what's holding it back>",
  "next_steps": [
    {
      "priority": 1,
      "area": "<Low end / Dynamics / Brightness / Transients / Space / Clarity / Arrangement / Gain>",
      "action": "<short action title>",
      "detail": "<exactly what to do, calibrated to the stated goal and stage. Plugin + parameter + value where relevant. Reference the measurements: e.g. 'Your 61% sub ratio is masking the kick — EQ Eight, -3dB shelf at 220Hz on the bus'>",
      "plugin": "<exact plugin from installed list or Ableton stock>"
    }
  ]
}

Give 3-5 steps ordered by impact for THIS specific goal and stage. If the goal is a club track, optimise for translation at volume. If it's a demo/sketch, focus on what to finish next, not polish.`,
        850
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      setNextStepsResult(JSON.parse(cleaned) as NextStepsResult)
      showToast('Analysis ready', 'Done')
    } catch (err: unknown) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Analysis failed'}`, 'Error')
    } finally {
      setGeneratingNextSteps(false)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────
  const card = {
    background: 'var(--panel)',
    border: '1px solid var(--border-dim)',
    padding: '28px 32px',
    marginBottom: '24px',
  } as const

  const cardGold = {
    ...card,
    border: '1px solid rgba(176, 141, 87, 0.2)',
  } as const

  const secHead = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ flex: 1, height: '1px', background: 'var(--border-dim)' }} />
    </div>
  )

  const btn = (busy: boolean, disabled = false, variant: 'gold' | 'dim' | 'green' = 'gold') => {
    const v = { gold: { bg: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: 'var(--gold)', color: 'var(--gold)' }, dim: { bg: 'transparent', border: 'var(--border-dim)', color: 'var(--text-dimmer)' }, green: { bg: 'linear-gradient(180deg, #1a2e1c 0%, #121e0e 100%)', border: 'var(--green)', color: 'var(--green)' } }[variant]
    return { background: busy ? 'transparent' : v.bg, border: `1px solid ${v.border}`, color: v.color, fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, padding: '12px 24px', cursor: busy || disabled ? 'default' : 'pointer', opacity: busy || disabled ? 0.45 : 1, display: 'flex', alignItems: 'center', gap: '10px', transition: 'opacity 0.15s' }
  }

  const spinner = <ScanPulse size="sm" />

  const fieldLabel: React.CSSProperties = { fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }


  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      <PageHeader
        section="SONIX Lab"
        sectionColor="var(--gold)"
        title="Your music"
        right={installedPlugins.length > 0 ? (
          <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--green)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            {installedPlugins.length} plugins loaded
          </div>
        ) : undefined}
        tabs={[
          { label: 'Reference Intel', active: mode === 'reference', onClick: () => setMode('reference') },
          { label: 'Track Analysis', active: mode === 'track', onClick: () => setMode('track') },
          { label: 'Devices', active: mode === 'devices', onClick: () => setMode('devices') },
        ]}
      />

      <div style={{ padding: '32px 48px' }}>

        {/* ── HOME — 2 tiles ── */}
        {!mode && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', maxWidth: '960px' }}>
            {([
              { id: 'reference' as const, sub: 'How did they do that?', title: 'Break down\na reference', desc: 'Enter any track — get BPM, key, production techniques, key sounds and mix character. Specific and actionable.' },
              { id: 'track' as const,     sub: 'Upload audio → next steps', title: 'Analyse\nmy track', desc: 'Drop in a file. Get acoustic measurements and a prioritised list of what to work on next — with exact plugin settings.' },
              { id: 'devices' as const,   sub: 'Max for Live + tools', title: 'Your\ndevices', desc: 'Signal Lab devices for Ableton. Chord engine, mix chains, plugin scanner — all connected to your account.' },
            ]).map(tile => (
              <button key={tile.id} onClick={() => setMode(tile.id)}
                style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '28px 24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-mono)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,141,87,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = '#111009' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-dim)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--panel)' }}
              >
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>{tile.sub}</div>
                <div className="display" style={{ fontSize: '22px', fontWeight: 300, color: 'var(--text)', marginBottom: '16px', lineHeight: 1.2, whiteSpace: 'pre-line' }}>{tile.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', lineHeight: '1.7', marginBottom: '28px' }}>{tile.desc}</div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>Open →</div>
              </button>
            ))}
          </div>
        )}

        {/* ── REFERENCE INTEL ── */}
        {mode === 'reference' && (
          <div style={{ maxWidth: '720px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
              <input value={refInput} onChange={e => setRefInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') analyseReference() }}
                placeholder="Artist — Track  (e.g. Bicep — Glue, Jon Hopkins — Emerald Rush)"
                style={{ ...inputStyle, flex: 1, fontSize: '14px', padding: '14px 18px' }}
                autoFocus
              />
              <button onClick={() => analyseReference()} disabled={analysingRef || !refInput.trim()} style={btn(analysingRef, !refInput.trim())}>
                {analysingRef && spinner}{analysingRef ? 'Analysing…' : 'Analyse →'}
              </button>
            </div>
            {analysingRef && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>Analysing — takes about 15 seconds…</div>}
            {referenceIntel && !analysingRef && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px', marginBottom: '2px' }}>
                  {[{ l: 'BPM', v: String(referenceIntel.bpm) }, { l: 'Key', v: referenceIntel.key }].map(item => (
                    <div key={item.l} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                      <div style={fieldLabel}>{item.l}</div>
                      <div className="display" style={{ fontSize: '32px', fontWeight: 300 }}>{item.v}</div>
                    </div>
                  ))}
                  {/* SONIX → SetLab pipeline */}
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={fieldLabel}>Set Lab</div>
                    {addedToLibrary ? (
                      <a href="/setlab" style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--green)', textDecoration: 'none' }}>
                        Added to library →
                      </a>
                    ) : (
                      <button onClick={addToSetLabLibrary} disabled={addingToLibrary}
                        style={{ background: 'none', border: `1px solid ${addingToLibrary ? 'var(--text-dimmer)' : 'var(--gold)'}`, color: addingToLibrary ? 'var(--text-dimmer)' : 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: addingToLibrary ? 'not-allowed' : 'pointer' }}>
                        {addingToLibrary ? 'Adding…' : 'ADD TO SET LAB →'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px', marginBottom: '2px' }}>
                  <div style={fieldLabel}>Energy arc</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '44px' }}>
                    {referenceIntel.energy_arc.map((e, i) => (
                      <div key={i} style={{ flex: 1, background: 'var(--gold)', height: `${e * 10}%`, minHeight: '3px', opacity: 0.5 + e * 0.05 }} />
                    ))}
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px', marginBottom: '2px' }}>
                  <div style={fieldLabel}>Techniques</div>
                  {referenceIntel.techniques.map((t, i) => (
                    <div key={i} style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: i < referenceIntel.techniques.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                      <div style={{ fontSize: '11px', color: 'var(--gold)', marginBottom: '4px', letterSpacing: '0.1em' }}>{t.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' }}>{t.detail}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', marginBottom: '2px' }}>
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                    <div style={fieldLabel}>Key sounds</div>
                    {referenceIntel.key_sounds.map((s, i) => (
                      <div key={i} style={{ fontSize: '13px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--gold)', display: 'inline-block', flexShrink: 0 }} />{s}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                    <div style={fieldLabel}>Mix character</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7' }}>{referenceIntel.mix_notes}</div>
                  </div>
                </div>
                {/* CTAs — Add to Sonic World + Add to SetLab + Discover on Beatport */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {(() => {
                    const artistName = refInput.includes('—') ? refInput.split('—')[0].trim() : refInput.split('-')[0].trim()
                    const alreadyAdded = sonicWorld.soundsLike.some(r => r.toLowerCase() === artistName.toLowerCase())
                    return (
                      <button
                        onClick={() => {
                          if (!alreadyAdded && artistName && sonicWorld.soundsLike.length < 6) {
                            setSonicWorld(s => ({ ...s, soundsLike: [...s.soundsLike, artistName] }))
                            showToast(`${artistName} added to Sonic World`, 'Sonic World')
                          }
                        }}
                        disabled={alreadyAdded || sonicWorld.soundsLike.length >= 6}
                        style={{ ...btn(false, alreadyAdded || sonicWorld.soundsLike.length >= 6, 'gold'), fontSize: '10px' }}>
                        {alreadyAdded ? '✓ In Sonic World' : `+ Add ${artistName} to Sonic World`}
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      `BPM: ${referenceIntel.bpm} · Key: ${referenceIntel.key}\n\nTechniques:\n${referenceIntel.techniques.map(t => `${t.name}: ${t.detail}`).join('\n')}\n\nKey sounds: ${referenceIntel.key_sounds.join(', ')}\n\nMix character: ${referenceIntel.mix_notes}`
                    ).then(() => showToast('Copied to clipboard', 'Done'))}
                    style={{ ...btn(false, false, 'dim'), fontSize: '10px' }}>
                    Copy notes →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRACK ANALYSIS ── */}
        {mode === 'track' && (
          <div style={{ maxWidth: '720px' }}>
            {/* Drop zone — hidden once we have measurements or are busy */}
            {!nextStepsResult && !generatingNextSteps && !showQuestions && !measuringAudio && (
              <div
                onDragOver={e => { e.preventDefault(); setNextStepsDrag(true) }}
                onDragLeave={() => setNextStepsDrag(false)}
                onDrop={e => { e.preventDefault(); setNextStepsDrag(false); const f = e.dataTransfer.files[0]; if (f) { setNextStepsFile(f); measureAndAsk(f) } }}
                onClick={() => nextStepsInputRef.current?.click()}
                style={{ border: `2px dashed ${nextStepsDrag ? 'var(--gold)' : 'var(--border-dim)'}`, padding: '72px 40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: nextStepsDrag ? 'rgba(176,141,87,0.04)' : 'transparent' }}
              >
                <div className="display" style={{ fontSize: '20px', fontWeight: 300, color: 'var(--text-dim)', marginBottom: '14px' }}>Drop your track here</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', lineHeight: '1.7' }}>
                  Or click to browse — WAV, AIFF, MP3<br />
                  <span style={{ fontSize: '11px', color: '#3a3830' }}>Works on stems, loops, or full mixes</span>
                </div>
                <input ref={nextStepsInputRef} type="file" accept=".wav,.aiff,.aif,.mp3,.flac" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setNextStepsFile(f); measureAndAsk(f) } }} />
              </div>
            )}

            {/* Measuring spinner */}
            {measuringAudio && (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-dimmer)' }}>Measuring your audio…</div>
                {nextStepsFile && <div style={{ fontSize: '11px', color: '#3a3830', marginTop: '8px' }}>{nextStepsFile.name}</div>}
              </div>
            )}

            {/* ── Context questions panel — shown after measurement ── */}
            {showQuestions && nextStepsMeasurements && !generatingNextSteps && (
              <div>
                {/* File confirmed */}
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '16px 24px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'var(--text)' }}>{nextStepsMeasurements.filename}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '2px' }}>
                      {(nextStepsMeasurements.duration_ms / 1000).toFixed(1)}s · Peak {nextStepsMeasurements.peak_db.toFixed(1)}dBFS · RMS {nextStepsMeasurements.rms_db.toFixed(1)}dBFS · {nextStepsMeasurements.spectral_centroid_hz}Hz centroid
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--panel)', border: '1px solid rgba(176,141,87,0.2)', padding: '28px 32px', marginBottom: '2px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>
                    One question — I&apos;ll calibrate everything to it
                  </div>

                  {/* Q1 — What are you making? (goal + stage combined) */}
                  <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '12px' }}>What are you making?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {[
                        { v: 'Club track — early sketch', label: 'Club sketch', sub: 'early ideas' },
                        { v: 'Club track — work in progress', label: 'Club WIP', sub: 'structure done' },
                        { v: 'Club track — nearly finished', label: 'Club release', sub: 'needs final polish' },
                        { v: 'Streaming / DSP release', label: 'Streaming release', sub: null },
                        { v: 'Sync / licensing — needs to translate anywhere', label: 'Sync', sub: null },
                        { v: 'Just exploring — no specific goal', label: 'Just exploring', sub: null },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setCtxGoal(ctxGoal === opt.v ? '' : opt.v)}
                          style={{ background: ctxGoal === opt.v ? 'rgba(176,141,87,0.12)' : 'transparent', border: `1px solid ${ctxGoal === opt.v ? 'var(--gold)' : 'var(--border-dim)'}`, color: ctxGoal === opt.v ? 'var(--gold)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', padding: '8px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                          <span>{opt.label}</span>
                          {opt.sub && <span style={{ fontSize: '9px', opacity: 0.6, letterSpacing: '0.08em' }}>{opt.sub}</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2 — Anything specific? (optional, measurement-aware) */}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                      Anything specific? <span style={{ color: 'var(--text-dimmer)', fontSize: '11px' }}>optional</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '12px' }}>
                      {nextStepsMeasurements.low_energy_ratio > 0.55 || nextStepsMeasurements.dynamic_range_db < 7 || nextStepsMeasurements.transient_sharpness < 0.35 || nextStepsMeasurements.spectral_centroid_hz < 900 || nextStepsMeasurements.spectral_centroid_hz > 4000
                        ? 'Detected from your audio — tap if relevant'
                        : 'Tap anything relevant or describe it'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      {[
                        ...(nextStepsMeasurements.low_energy_ratio > 0.55 ? [{ v: 'Low end feels muddy', label: 'Low end muddy ↑' }] : []),
                        ...(nextStepsMeasurements.dynamic_range_db < 7 ? [{ v: 'Sounds too compressed / squashed', label: 'Too compressed ↑' }] : []),
                        ...(nextStepsMeasurements.transient_sharpness < 0.35 ? [{ v: 'Kick / transients lack punch', label: 'Lacks punch ↑' }] : []),
                        ...(nextStepsMeasurements.spectral_centroid_hz < 900 ? [{ v: 'Sounds dark / no presence or air', label: 'Too dark ↑' }] : []),
                        ...(nextStepsMeasurements.spectral_centroid_hz > 4000 ? [{ v: 'Sounds thin or too bright', label: 'Too bright ↑' }] : []),
                        { v: 'Arrangement feels flat or repetitive', label: 'Arrangement' },
                        { v: 'Mix lacks space, width or depth', label: 'Space / width' },
                        { v: 'Overall loudness and level', label: 'Loudness' },
                      ].map(opt => (
                        <button key={opt.v}
                          onClick={() => { setCtxFocus(ctxFocus === opt.v ? '' : opt.v); if (ctxFocus !== opt.v) setCtxFocusCustom('') }}
                          style={{ background: ctxFocus === opt.v ? 'rgba(176,141,87,0.12)' : 'transparent', border: `1px solid ${ctxFocus === opt.v ? 'var(--gold)' : opt.label.includes('↑') ? 'rgba(176,141,87,0.35)' : 'var(--border-dim)'}`, color: ctxFocus === opt.v ? 'var(--gold)' : opt.label.includes('↑') ? 'rgba(176,141,87,0.7)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', padding: '8px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={ctxFocusCustom}
                      onChange={e => { setCtxFocusCustom(e.target.value); if (e.target.value) setCtxFocus('') }}
                      placeholder="Or describe it…"
                      style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button onClick={runAnalysisWithContext}
                      style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 32px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      Analyse →
                    </button>
                    <button onClick={() => { setShowQuestions(false); setNextStepsFile(null); setNextStepsMeasurements(null) }}
                      style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 24px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    {!ctxGoal && (
                      <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginLeft: '4px' }}>or skip for general feedback</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {generatingNextSteps && (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-dimmer)' }}>Analysing…</div>
                {nextStepsFile && <div style={{ fontSize: '11px', color: '#3a3830', marginTop: '8px' }}>{nextStepsFile.name}</div>}
              </div>
            )}
            {nextStepsResult && !generatingNextSteps && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', marginBottom: '2px' }}>
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                    <div style={fieldLabel}>Detected</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>{nextStepsResult.detected_type}</div>
                  </div>
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                    <div style={fieldLabel}>Current state</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' }}>{nextStepsResult.current_state}</div>
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px', marginBottom: '16px' }}>
                  <div style={fieldLabel}>Next steps</div>
                  {nextStepsResult.next_steps.map((step, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '16px', padding: '16px 0', borderBottom: i < nextStepsResult.next_steps.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                      <div className="display" style={{ fontSize: '24px', fontWeight: 300, color: 'var(--gold)', lineHeight: 1 }}>{step.priority}</div>
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '13px', color: 'var(--text)' }}>{step.action}</div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{step.area}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>{step.detail}</div>
                        {step.plugin && <div style={{ fontSize: '10px', color: 'var(--gold)', marginTop: '6px', opacity: 0.7 }}>{step.plugin}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => { setNextStepsResult(null); setNextStepsFile(null); setNextStepsMeasurements(null); setShowQuestions(false); setCtxGoal(''); setCtxFocus(''); setCtxFocusCustom('') }} style={btn(false, false, 'dim')}>
                    Analyse another →
                  </button>
                  <button onClick={() => {
                    if (!nextStepsResult) return
                    const text = `${nextStepsResult.detected_type}\n${nextStepsResult.current_state}\n\nNext steps:\n${nextStepsResult.next_steps.map(s => `${s.priority}. ${s.action} (${s.area})\n   ${s.detail}${s.plugin ? `\n   Plugin: ${s.plugin}` : ''}`).join('\n\n')}`
                    navigator.clipboard.writeText(text).then(() => showToast('Copied', 'Done'))
                  }} style={btn(false, false, 'dim')}>
                    Copy →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DEVICES ── */}
        {mode === 'devices' && (() => {
          const devices = [
            { name: 'Chord Engine', desc: 'Play one note, get a full chord. Pick a key, set how jazzy you want it, and play.', specs: '10 keys · Major, minor, diminished · Extensions up to 13ths', steps: ['Pick your key (A minor, C major, etc.)', 'Turn the Tension knob — low = simple triads, high = jazzy extensions', 'Play any MIDI note → out comes the full chord'], download: '/downloads/SL_Chord_Engine.amxd' },
            { name: 'Plugin Scanner', desc: 'Scans every plugin on your machine and syncs the list to Signal Lab. Powers smart mix suggestions.', specs: 'Mac + Windows · VST3 · Audio Units · Automatic sync', steps: ['Drop it on any track in Ableton', 'Hit Scan — finds all your VST3 and AU plugins', 'List syncs to your Signal Lab account automatically'], download: '/downloads/SL_Scanner.amxd' },
            { name: 'Mix Chain', desc: 'Preset starting points for common stem types. Loads a signal chain to work from — you take it from there.', specs: '12 presets · Vocal · Bass · Synth · Drums · Stock + VST', steps: ['Pick your sound type (Vocal, Bass, Synth, Drum, etc.)', 'Choose a flavour (Warmth, Presence, Punch, Dark…)', 'Chain loads as a starting point — adjust everything to your ear'], download: null },
            { name: 'Signal Genius', desc: 'Your production assistant inside Ableton. Ask anything about your session — mixing, arrangement, sound design.', specs: 'Context-aware · Knows your plugins', steps: ['Opens a chat panel inside Ableton', 'Ask anything — "How do I get this bass sound thicker?"', 'Gets answers tailored to your plugins and workflow'], download: null },
            { name: 'Chord Lab', desc: 'Visual chord theory right inside Ableton. See chord shapes, inversions, and voicings without leaving your session.', specs: 'Visual · Interactive chord browser · Theory reference', steps: ['Opens a visual panel inside Ableton', 'Browse chords by key and type', 'Click to hear — drag to your MIDI clip'], download: null },
            { name: 'Artist OS Bridge', desc: 'Connects Ableton directly to your Signal Lab dashboard. Your session data flows into your artist profile.', specs: 'Background sync · Feeds your dashboard · Zero friction', steps: ['Runs in the background on any track', 'Syncs session info to your Signal Lab profile', 'Powers smart suggestions across the whole platform'], download: null },
          ]
          return (
          <div style={{ maxWidth: '960px' }}>
            {/* Download all banner */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 28px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>Signal Lab M4L Suite</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>All devices in one download. Drop into your Ableton User Library.</div>
              </div>
              <a href="/api/download" style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '10px 20px', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Download All →
              </a>
            </div>

            {/* Compact device cards — 3-col, click to expand */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px' }}>
              {devices.map(device => (
                <DeviceCard key={device.name} device={device} />
              ))}
            </div>

            <div style={{ marginTop: '16px', padding: '14px 20px', border: '1px solid var(--border-dim)', fontSize: '10px', color: 'var(--text-dimmer)', lineHeight: '1.6' }}>
              <span style={{ color: 'var(--gold)', opacity: 0.6 }}>Requirements:</span> Ableton Live 11+ with Max for Live · macOS or Windows · Signal Lab account
            </div>
          </div>
          )
        })()}

      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: '1px solid var(--border)', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 1000, backdropFilter: 'blur(16px)', minWidth: '240px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>{toast.tag}</div>
          <div style={{ fontSize: '13px', color: 'var(--text)' }}>{toast.msg}</div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

function DeviceCard({ device }: { device: { name: string; desc: string; specs: string; steps: string[]; download: string | null } }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '22px 24px', cursor: 'pointer', transition: 'all 0.15s' }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 300, fontFamily: 'var(--font-display)' }}>{device.name}</div>
        {device.download
          ? <span style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'var(--green)', textTransform: 'uppercase', padding: '2px 8px', border: '1px solid rgba(61,107,74,0.3)' }}>Available</span>
          : <span style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'var(--text-dimmest)', textTransform: 'uppercase', padding: '2px 8px', border: '1px solid var(--border-dim)' }}>Soon</span>
        }
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '8px' }}>{device.desc}</div>
      <div style={{ fontSize: '9px', color: 'var(--text-dimmer)', letterSpacing: '0.06em' }}>{device.specs}</div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-dim)' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>How it works</div>
          {device.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: i < device.steps.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
              <div style={{ fontSize: '10px', color: 'var(--gold)', minWidth: '14px' }}>{i + 1}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>{step}</div>
            </div>
          ))}
          {device.download && (
            <a href={device.download} download onClick={e => e.stopPropagation()}
              style={{ display: 'inline-block', marginTop: '14px', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--gold)', textTransform: 'uppercase', textDecoration: 'none', border: '1px solid rgba(176,141,87,0.3)', padding: '8px 16px' }}>
              Download .amxd →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
