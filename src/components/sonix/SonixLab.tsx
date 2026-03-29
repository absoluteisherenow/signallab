'use client'
import { TrackUploader } from './TrackUploader'
import { useState, useEffect, useRef, useCallback } from 'react'

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

// ── Chain category definitions (used as selector only) ───────────────────
const CHAINS = [
  { name: 'Vocal — Warmth',     type: 'vocal', desc: 'Vintage compression, harmonic saturation, air shelf' },
  { name: 'Vocal — Presence',   type: 'vocal', desc: 'Forward mid push, de-ess, bright reverb tail' },
  { name: 'Vocal — Intimate',   type: 'vocal', desc: 'Close-mic feel, subtle tape, room ambience' },
  { name: 'Vocal — Radio',      type: 'vocal', desc: 'Aggressive limiting, telephonic character, punch' },
  { name: 'Vocal — Depth',      type: 'vocal', desc: 'Wide stereo, long pre-delay, lush modulation' },
  { name: 'Vocal — Dark',       type: 'vocal', desc: 'Low-mid body, rolled highs, dense reverb' },
  { name: 'Vocal — Airy',       type: 'vocal', desc: 'High-shelf lift, minimal compression, open space' },
  { name: 'Vocal — Electronic', type: 'vocal', desc: 'Pitch character, bit colour, parallel distortion' },
  { name: 'Bass — Sub',         type: 'bass',  desc: 'Clean sub foundation, gentle limiting, no upper harmonics' },
  { name: 'Bass — Midrange',    type: 'bass',  desc: 'Upper harmonic focus, growl, speaker-friendly' },
  { name: 'Bass — Reese',       type: 'bass',  desc: 'Detuned character, dark modulation, movement' },
  { name: 'Bass — Punch',       type: 'bass',  desc: 'Transient snap, fast attack, tight release' },
  { name: 'Synth — Pad',        type: 'synth', desc: 'Wide stereo, slow attack, soft harmonic sheen' },
  { name: 'Synth — Lead',       type: 'synth', desc: 'Mono focus, mid presence, clean sustain' },
  { name: 'Synth — Texture',    type: 'synth', desc: 'Granular movement, spectral interest, background depth' },
  { name: 'Drum — Room',        type: 'drum',  desc: 'Natural room glue, parallel compression, weight' },
  { name: 'Drum — Electronic',  type: 'drum',  desc: 'Tight transients, no room, surgical punch' },
  { name: 'Reference',          type: 'ref',   desc: 'LUFS matching, dynamic ceiling, true peak control' },
]

const typeColors: Record<string, string> = {
  vocal: '#b08d57', bass: '#5a8a6a', synth: '#6a7a9a', drum: '#9a6a5a', ref: '#7a6a8a',
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

  // ── Sonic World (persistent) ─────────────────────────────────────────
  const [sonicWorld, setSonicWorld] = useState(DEFAULT_SONIC_WORLD)
  const [newRef, setNewRef] = useState('')

  // ── Installed plugins ────────────────────────────────────────────────
  const [installedPlugins, setInstalledPlugins] = useState<string[]>([])

  // ── Reference Intel ──────────────────────────────────────────────────
  const [refInput, setRefInput] = useState('')
  const [referenceIntel, setReferenceIntel] = useState<ReferenceIntel | null>(null)
  const [analysingRef, setAnalysingRef] = useState(false)

  // ── Quick Ask ────────────────────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const [questionResult, setQuestionResult] = useState('')
  const [askingQuestion, setAskingQuestion] = useState(false)

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
  const [selectedChain, setSelectedChain] = useState<number | null>(null)
  const [chainResult, setChainResult] = useState('')
  const [generatingChain, setGeneratingChain] = useState(false)
  const [activeType, setActiveType] = useState('all')
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

  // ── Persist Sonic World to localStorage ──────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sonix_world')
      if (saved) setSonicWorld(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('sonix_world', JSON.stringify(sonicWorld)) } catch {}
  }, [sonicWorld])

  // ── Load installed plugins ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/plugins/sync')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.plugins) && d.plugins.length) setInstalledPlugins(d.plugins) })
      .catch(() => {})
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

  // ── Reference Intel ───────────────────────────────────────────────────
  async function analyseReference() {
    if (!refInput.trim()) { showToast('Enter a track name first', 'Error'); return }
    setAnalysingRef(true)
    setReferenceIntel(null)
    try {
      const raw = await callClaude(
        `You are an expert music analyst with encyclopedic knowledge of electronic music. Return ONLY valid JSON, no markdown.`,
        `Analyse this track for a producer who wants to work in a similar sonic world: "${refInput}"

Return JSON:
{
  "bpm": <number — actual BPM of this track>,
  "key": "<actual key, e.g. 'A minor'>",
  "energy_arc": [<array of 6-8 energy values 1-10 representing the track arc from start to end>],
  "techniques": [
    { "name": "<technique name>", "detail": "<specific setting or approach — exact frequencies, ratios, plugin names if known, e.g. 'Parallel compression on drums, 6:1 ratio, 2ms attack, returns blended at -6dB'>"},
    { "name": "<technique name>", "detail": "<specific detail>" },
    { "name": "<technique name>", "detail": "<specific detail>" }
  ],
  "key_sounds": ["<sound element 1>", "<sound element 2>", "<sound element 3>", "<sound element 4>"],
  "mix_notes": "<One sentence on the mix character — low end approach, mid range, high end, stereo width>"
}

Be specific. Real BPM and key. Real techniques with actual settings, not descriptions.`,
        700
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned) as ReferenceIntel
      setReferenceIntel(parsed)
      // Auto-populate Sonic World
      if (parsed.key) setSonicWorld(s => ({ ...s, key: parsed.key }))
      if (parsed.bpm) setSonicWorld(s => ({ ...s, bpm: String(parsed.bpm) }))
      showToast('Reference analysed', 'Done')
    } catch {
      showToast('Analysis failed — try a well-known track', 'Error')
    } finally {
      setAnalysingRef(false)
    }
  }

  // ── Quick Ask ─────────────────────────────────────────────────────────
  async function askQuestion() {
    if (!question.trim()) return
    setAskingQuestion(true)
    setQuestionResult('')
    try {
      const raw = await callClaude(
        `You are an expert electronic music producer. ${sonicCtxString() ? `Session context: ${sonicCtxString()}.` : ''} ${pluginCtxString()}
Answer in 2-3 sentences MAXIMUM. Be specific and concrete — exact plugin names, frequencies, settings. No generic advice. No lists.`,
        question.trim(),
        300
      )
      setQuestionResult(raw)
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setAskingQuestion(false)
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
        `You are an expert electronic music composer. Return ONLY valid JSON, no markdown.`,
        `Generate chord voicings for a producer making: "${sonicWorld.making || sonicWorld.genre || 'electronic music'}"
Key: ${sonicWorld.key || 'A minor'}
Genre: ${sonicWorld.genre}
${sonicWorld.soundsLike.length ? `Sounds like: ${sonicWorld.soundsLike.join(', ')}` : ''}
${refCtx}

Return JSON:
{
  "voicings": [
    { "name": "<chord name>", "notes": "<actual note names with octave, e.g. 'A2 · E3 · A3 · C4 · E4'>", "character": "<one sentence on feel/use>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<feel>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<feel>" },
    { "name": "<chord name>", "notes": "<actual notes>", "character": "<feel>" }
  ],
  "motif": "<Describe a melodic motif using interval directions — e.g. 'root, up minor 3rd to C, down a step to B, hold 2 beats, resolve up to D'>"
}

Real note names only. No Roman numerals. No theory labels. Notes a producer can play directly.`,
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
        `You are an expert electronic music arranger. Return ONLY valid JSON, no markdown.`,
        `Create a detailed arrangement for:
Making: ${sonicWorld.making || sonicWorld.genre + ' track'}
Key: ${sonicWorld.key}
BPM: ${sonicWorld.bpm || '130'}
Genre: ${sonicWorld.genre}
${sonicWorld.soundsLike.length ? `Reference artists: ${sonicWorld.soundsLike.join(', ')}` : ''}
${refIntelCtx}

Return JSON:
{
  "sections": [
    { "name": "Intro", "bars": 8, "energy": 2, "elements": "<what's playing>", "notes": "<production tip>" },
    ... continue through full track including Build, Drop, Breakdown, Build 2, Drop 2, Outro
  ],
  "key_moments": ["<e.g. 'Drop hits bar 32 — remove all reverb on kick for impact'>", "<moment 2>"],
  "production_tips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"]
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

  // ── Chain advice ──────────────────────────────────────────────────────
  async function generateChainAdvice() {
    if (selectedChain === null) { showToast('Select a chain type first', 'Error'); return }
    setGeneratingChain(true)
    setChainResult('')
    const chain = CHAINS[selectedChain]
    try {
      const raw = await callClaude(
        `You are an expert mix engineer with 20+ years in electronic music. Give specific plugin settings and techniques. ${pluginCtxString()}`,
        `Chain type: ${chain.name}
Context: ${sonicCtxString() || chain.desc}
${installedPlugins.length ? `Use from the producer's actual installed plugins where possible: ${installedPlugins.slice(0,30).join(', ')}` : ''}

Give:
1. Signal chain order with specific plugins (prefer installed plugins if provided, otherwise Ableton stock)
2. Key settings for each plugin (specific dB values, ratios, frequencies, times)
3. The one setting that makes or breaks this chain
4. What to listen for to know it's right`,
        500
      )
      setChainResult(raw.replace(/\*\*/g,'').replace(/^#{1,3} /gm,''))
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingChain(false)
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
  async function analyseAndSuggestNextSteps(file: File) {
    setGeneratingNextSteps(true)
    setNextStepsResult(null)
    setNextStepsMeasurements(null)
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const arrayBuf = await file.arrayBuffer()
      const audioBuf = await ctx.decodeAudioData(arrayBuf)
      const m = measureAudioBuffer(audioBuf, file.name)
      setNextStepsMeasurements(m)

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

      const raw = await callClaude(
        `You are an expert electronic music producer and mixing engineer analysing a producer's work-in-progress audio. Return ONLY valid JSON, no markdown.`,
        `I've uploaded audio I'm working on. Based on the acoustic measurements and my session context, tell me the most important next steps.

SESSION CONTEXT:
${sonicCtxString() || 'No session context set'}
${installedPlugins.length ? `Installed plugins: ${installedPlugins.slice(0, 40).join(', ')}` : 'No plugins scanned — recommend Ableton stock'}

AUDIO MEASUREMENTS:
  File: ${m.filename}
  Duration: ${(m.duration_ms / 1000).toFixed(1)}s  |  ${m.channels === 1 ? 'Mono' : 'Stereo'}  |  ${m.sample_rate}Hz
  Peak: ${m.peak_db.toFixed(1)}dBFS
  RMS: ${m.rms_db.toFixed(1)}dBFS
  Dynamic Range: ${m.dynamic_range_db.toFixed(1)}dB → ${dynLabel}
  Spectral Centroid: ${m.spectral_centroid_hz}Hz → ${brightnessLabel}
  Low Energy (below 200Hz): ${(m.low_energy_ratio * 100).toFixed(1)}% → ${subLabel}
  High Energy (above 4kHz): ${(m.high_energy_ratio * 100).toFixed(1)}%
  Transient Sharpness: ${m.transient_sharpness.toFixed(3)} → ${transientLabel}
  Fundamental: ${m.fundamental_hz}Hz
  Spectral Flatness: ${m.spectral_flatness.toFixed(3)} (0=tonal, 1=noise-like)

Return JSON:
{
  "detected_type": "<what this likely is: full mix, drum loop, bass stem, synth pad, etc>",
  "current_state": "<one sentence: what does this audio sound like right now based on the measurements>",
  "next_steps": [
    {
      "priority": 1,
      "area": "<Low end / Dynamics / Brightness / Transients / Space / Clarity / Gain>",
      "action": "<short action title, e.g. 'Tame the mid-bass buildup'>",
      "detail": "<exactly what to do — plugin name, exact parameter, value. E.g. 'EQ Eight: -3dB shelf at 220Hz, Q 1.4 on the master bus — the 64% sub ratio is masking the kick punch'>",
      "plugin": "<exact plugin name from installed list or Ableton stock>"
    }
  ]
}

Give 3-5 next steps ordered by impact. Use installed plugins where available, Ableton stock otherwise. Be concrete: exact frequencies, ratios, dB values. Reference the session context and sonic world throughout.`,
        750
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      setNextStepsResult(JSON.parse(cleaned) as NextStepsResult)
      showToast('Next steps ready', 'Done')
    } catch (err: unknown) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Analysis failed'}`, 'Error')
    } finally {
      setGeneratingNextSteps(false)
    }
  }

  const filteredChains = activeType === 'all' ? CHAINS : CHAINS.filter(c => c.type === activeType)

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

  const spinner = <div style={{ width: '10px', height: '10px', border: '1px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />

  const fieldLabel: React.CSSProperties = { fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      {/* ── Page header ── */}
      <div style={{ padding: '52px 56px 44px', borderBottom: '1px solid var(--border-dim)' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
          Artist OS — Modular Suite
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 200, lineHeight: 1.0 }}>Sonix Lab.</div>
            <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginTop: '10px' }}>Production tools — composition, chains &amp; analysis</div>
          </div>
          {installedPlugins.length > 0 && (
            <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--green)', textTransform: 'uppercase' }}>
              {installedPlugins.length} plugins loaded
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '44px 56px' }}>

        {/* ── Sonic World ── */}
        <div style={{ ...cardGold, marginBottom: '32px' }}>
          {secHead('Sonic World — session context')}
          <div style={{ marginBottom: '20px' }}>
            <div style={fieldLabel}>Sounds like <span style={{ color: 'var(--text-dimmest)', textTransform: 'none', letterSpacing: 0 }}>(up to 6)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {sonicWorld.soundsLike.map((ref, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(176,141,87,0.07)', border: '1px solid rgba(176,141,87,0.22)', padding: '5px 12px', fontSize: '12px', color: 'var(--gold)' }}>
                  {ref}
                  <button onClick={() => removeRef(i)} style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '14px', padding: '0', lineHeight: '1' }}>×</button>
                </div>
              ))}
              {sonicWorld.soundsLike.length < 6 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={newRef} onChange={e => setNewRef(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addRef() }}
                    placeholder="Artist — Track (Enter to add)"
                    style={{ ...inputStyle, width: '260px' }} />
                  <button onClick={addRef} style={{ ...btn(false), padding: '8px 16px' }}>Add</button>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div>
              <div style={fieldLabel}>Key</div>
              <select value={sonicWorld.key} onChange={e => setSonicWorld(s => ({ ...s, key: e.target.value }))} style={inputStyle}>
                {['A minor','C major','D minor','E minor','F major','G major','B minor','Eb major','F# minor','Bb major','C# minor','Ab major'].map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <div style={fieldLabel}>BPM</div>
              <input value={sonicWorld.bpm} onChange={e => setSonicWorld(s => ({ ...s, bpm: e.target.value }))} placeholder="125" type="number" style={inputStyle} />
            </div>
            <div>
              <div style={fieldLabel}>Genre</div>
              <select value={sonicWorld.genre} onChange={e => setSonicWorld(s => ({ ...s, genre: e.target.value }))} style={inputStyle}>
                {['Electronic','Deep House','Techno','Ambient','Drum & Bass','UK Garage','Afrobeats','Hip Hop','Pop','R&B','Jazz'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <div style={fieldLabel}>Making</div>
              <input value={sonicWorld.making} onChange={e => setSonicWorld(s => ({ ...s, making: e.target.value }))} placeholder="6-min DJ tool, dark techno…" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* ── Ask anything ── */}
        <div style={{ ...card, marginBottom: '32px' }}>
          {secHead('Ask anything')}
          <div style={{ display: 'flex', gap: '12px' }}>
            <input value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') askQuestion() }}
              placeholder={`Why is my kick clashing? / How do ${sonicWorld.soundsLike[0] || 'Bicep'} get that bass width?`}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={askQuestion} disabled={askingQuestion || !question.trim()} style={btn(askingQuestion, !question.trim())}>
              {askingQuestion && spinner}
              {askingQuestion ? 'Thinking…' : 'Ask →'}
            </button>
          </div>
          {questionResult && (
            <div style={{ marginTop: '16px', padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-warm)', letterSpacing: '0.03em' }}>{questionResult}</div>
            </div>
          )}
        </div>

        {/* ── Reference Intel ── */}
        <div style={{ ...card, marginBottom: '32px' }}>
          {secHead('Reference Intel — break down any track')}
          <div style={{ display: 'flex', gap: '12px', marginBottom: referenceIntel ? '24px' : '0' }}>
            <input value={refInput} onChange={e => setRefInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') analyseReference() }}
              placeholder="Artist — Track (e.g. Bicep — Glue, Jon Hopkins — Emerald Rush)"
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={analyseReference} disabled={analysingRef} style={btn(analysingRef)}>
              {analysingRef && spinner}
              {analysingRef ? 'Analysing…' : 'Analyse →'}
            </button>
          </div>

          {referenceIntel && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[{ label: 'BPM', value: String(referenceIntel.bpm) }, { label: 'Key', value: referenceIntel.key }].map(b => (
                  <div key={b.label} style={{ background: 'var(--bg)', border: '1px solid rgba(176,141,87,0.2)', padding: '10px 20px', minWidth: '80px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>{b.label}</div>
                    <div style={{ fontSize: '18px', color: 'var(--gold)' }}>{b.value}</div>
                  </div>
                ))}
                {referenceIntel.energy_arc.length > 0 && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '10px 16px', flex: 1 }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Energy arc</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '28px' }}>
                      {referenceIntel.energy_arc.map((v, i) => (
                        <div key={i} style={{ flex: 1, height: `${(v / 10) * 100}%`, background: v > 7 ? 'var(--gold)' : v > 4 ? 'var(--green)' : 'var(--border)', transition: 'height 0.3s' }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {referenceIntel.key_sounds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {referenceIntel.key_sounds.map((s, i) => (
                    <div key={i} style={{ fontSize: '11px', background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '4px 10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{s}</div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                {referenceIntel.techniques.map((t, i) => (
                  <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '8px' }}>{t.name}</div>
                    <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'var(--text-dim)' }}>{t.detail}</div>
                  </div>
                ))}
              </div>
              {referenceIntel.mix_notes && (
                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', fontStyle: 'italic', borderTop: '1px solid var(--border-dim)', paddingTop: '14px' }}>
                  {referenceIntel.mix_notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Composition ── */}
        <div style={{ ...card, marginBottom: '32px' }}>
          {secHead('Composition — chords, melody & arrangement')}

          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ ...fieldLabel, marginBottom: 0 }}>
                Real voicings — {sonicWorld.key}
                {sonicWorld.soundsLike.length > 0 && <span style={{ color: 'var(--text-dimmest)', textTransform: 'none', letterSpacing: 0 }}> · {sonicWorld.soundsLike[0]}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={generateChords} disabled={generatingChords} style={btn(generatingChords)}>
                  {generatingChords && spinner}{generatingChords ? '…' : 'Generate voicings'}
                </button>
                <button onClick={generateMelody} disabled={generatingMelody || chordVoicings.length === 0} style={btn(generatingMelody, chordVoicings.length === 0, 'green')}>
                  {generatingMelody && spinner}{generatingMelody ? '…' : 'Melody ideas'}
                </button>
              </div>
            </div>
            {chordVoicings.length > 0 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {chordVoicings.map((c, i) => (
                    <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: '8px' }}>{c.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px', letterSpacing: '0.05em' }}>{c.notes}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', fontStyle: 'italic', lineHeight: '1.4' }}>{c.character}</div>
                    </div>
                  ))}
                </div>
                {motifResult && (
                  <div style={{ background: 'var(--bg)', border: '1px solid rgba(176,141,87,0.15)', padding: '14px 18px' }}>
                    <div style={fieldLabel}>Motif idea</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-warm)', lineHeight: '1.6' }}>{motifResult}</div>
                  </div>
                )}
              </div>
            )}
            {melodyResult && (
              <div style={{ marginTop: '14px', background: 'var(--bg)', border: '1px solid rgba(61,107,74,0.3)', padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(61,107,74,0.2)' }}>Melody ideas</div>
                <div style={{ fontSize: '13px', lineHeight: '1.9', color: 'var(--text-warm)', whiteSpace: 'pre-wrap' }}>{melodyResult}</div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ ...fieldLabel, marginBottom: 0 }}>Arrangement — {sonicWorld.making || sonicWorld.genre}</div>
              <button onClick={generateArrangement} disabled={generatingArrange} style={btn(generatingArrange)}>
                {generatingArrange && spinner}{generatingArrange ? '…' : 'Generate arrangement'}
              </button>
            </div>
            {energyArc.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '48px', marginBottom: '20px' }}>
                {energyArc.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${(v / 10) * 100}%`, background: v > 7 ? 'var(--gold)' : v > 4 ? 'var(--green)' : 'var(--border)', transition: 'height 0.3s', position: 'relative' }}>
                    <div style={{ position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--text-dimmest)' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {arrangeSections.length > 0 && (
              <div style={{ marginTop: energyArc.length ? '24px' : '0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  {arrangeSections.map((s, i) => (
                    <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.energy > 7 ? 'var(--gold)' : 'var(--text-dim)' }}>{s.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{s.bars}b</div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px', lineHeight: '1.4' }}>{s.elements}</div>
                      {s.notes && <div style={{ fontSize: '10px', color: 'var(--text-dimmest)', fontStyle: 'italic', lineHeight: '1.4' }}>{s.notes}</div>}
                    </div>
                  ))}
                </div>
                {arrangeExtra && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {arrangeExtra.key_moments.length > 0 && (
                      <div style={{ background: 'var(--bg)', border: '1px solid rgba(176,141,87,0.15)', padding: '14px 18px' }}>
                        <div style={fieldLabel}>Key moments</div>
                        {arrangeExtra.key_moments.map((m, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-warm)', lineHeight: '1.6', marginBottom: '6px' }}>→ {m}</div>)}
                      </div>
                    )}
                    {arrangeExtra.production_tips.length > 0 && (
                      <div style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '14px 18px' }}>
                        <div style={fieldLabel}>Production tips</div>
                        {arrangeExtra.production_tips.map((t, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6', marginBottom: '6px' }}>→ {t}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Signal Chains ── */}
        <div style={{ ...card, marginBottom: '32px' }}>
          {secHead(`Signal Chains${installedPlugins.length > 0 ? ` — ${installedPlugins.length} plugins loaded` : ''}`)}

          <div style={{ marginBottom: '24px', padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border-dim)' }}>
            <div style={{ ...fieldLabel, marginBottom: '12px' }}>Stem analysis</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {(['kick','bass','vocals','synths','drums','full_mix'] as const).map(t => (
                <button key={t} onClick={() => setStemType(t)} style={{
                  background: stemType === t ? 'rgba(176,141,87,0.08)' : 'transparent',
                  border: `1px solid ${stemType === t ? 'var(--gold)' : 'var(--border-dim)'}`,
                  color: stemType === t ? 'var(--gold)' : 'var(--text-dimmer)',
                  fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
                  padding: '6px 14px', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.15s',
                }}>{t.replace('_',' ')}</button>
              ))}
              <button onClick={analyseStem} disabled={analysingStem} style={{ ...btn(analysingStem), marginLeft: 'auto', padding: '6px 20px' }}>
                {analysingStem && spinner}{analysingStem ? '…' : 'Analyse stem'}
              </button>
            </div>
            {stemAnalysis && <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text-warm)', whiteSpace: 'pre-wrap' }}>{stemAnalysis}</div>}
          </div>

          <div style={{ ...fieldLabel, marginBottom: '12px' }}>Select chain type</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {['all','vocal','bass','synth','drum','ref'].map(t => (
              <button key={t} onClick={() => setActiveType(t)} style={{
                background: activeType === t ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: `1px solid ${activeType === t ? (typeColors[t] || 'var(--text-dim)') : 'var(--border-dim)'}`,
                color: activeType === t ? (typeColors[t] || 'var(--text)') : 'var(--text-dimmer)',
                fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
                padding: '6px 14px', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.15s',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {filteredChains.map((chain, i) => {
              const idx = CHAINS.indexOf(chain)
              const selected = selectedChain === idx
              return (
                <div key={i} onClick={() => { setSelectedChain(idx); setChainResult('') }} style={{
                  background: selected ? 'rgba(255,255,255,0.03)' : 'var(--bg)',
                  border: `1px solid ${selected ? (typeColors[chain.type] || 'var(--border)') : 'var(--border-dim)'}`,
                  padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ fontSize: '12px', color: selected ? (typeColors[chain.type] || 'var(--text)') : 'var(--text-dim)' }}>{chain.name}</div>
                    <div style={{ fontSize: '9px', color: typeColors[chain.type] || 'var(--text-dimmer)', border: `1px solid ${typeColors[chain.type] || 'var(--border-dim)'}33`, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{chain.type}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmest)', fontStyle: 'italic', lineHeight: '1.4' }}>{chain.desc}</div>
                </div>
              )
            })}
          </div>

          {selectedChain !== null && (
            <div style={{ padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border-dim)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{CHAINS[selectedChain].name}</div>
                <button onClick={generateChainAdvice} disabled={generatingChain} style={btn(generatingChain)}>
                  {generatingChain && spinner}{generatingChain ? '…' : 'Get chain →'}
                </button>
              </div>
              {chainResult && <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text-warm)', whiteSpace: 'pre-wrap' }}>{chainResult}</div>}
            </div>
          )}
        </div>

        {/* ── Next Steps ── */}
        <div style={{ ...card, marginBottom: '32px' }}>
          {secHead('Next Steps — upload what you\'ve made')}
          <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginBottom: '20px' }}>
            Drop audio you&apos;re working on. Get concrete next steps based on real acoustic measurements and your sonic world.
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setNextStepsDrag(true) }}
            onDragLeave={() => setNextStepsDrag(false)}
            onDrop={e => {
              e.preventDefault(); setNextStepsDrag(false)
              const f = e.dataTransfer.files[0]
              if (f) { setNextStepsFile(f); setNextStepsResult(null); setNextStepsMeasurements(null) }
            }}
            onClick={() => nextStepsInputRef.current?.click()}
            style={{
              border: `1px dashed ${nextStepsDrag ? 'var(--gold)' : 'var(--border)'}`,
              padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px',
              background: nextStepsDrag ? 'rgba(176,141,87,0.03)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <input ref={nextStepsInputRef} type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.flac" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setNextStepsFile(f); setNextStepsResult(null); setNextStepsMeasurements(null) } }}
            />
            {nextStepsFile ? (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>{nextStepsFile.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{(nextStepsFile.size / 1024 / 1024).toFixed(1)} MB · click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '6px' }}>Drop audio here or click to browse</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmest)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>WAV · AIFF · MP3 · FLAC</div>
              </div>
            )}
          </div>

          {nextStepsFile && (
            <button onClick={() => analyseAndSuggestNextSteps(nextStepsFile)} disabled={generatingNextSteps} style={btn(generatingNextSteps)}>
              {generatingNextSteps && spinner}
              {generatingNextSteps ? 'Analysing audio…' : 'Analyse & suggest next steps →'}
            </button>
          )}

          {nextStepsMeasurements && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
              {[
                { label: 'Peak',       value: `${nextStepsMeasurements.peak_db.toFixed(1)} dBFS` },
                { label: 'RMS',        value: `${nextStepsMeasurements.rms_db.toFixed(1)} dBFS` },
                { label: 'Centroid',   value: `${nextStepsMeasurements.spectral_centroid_hz} Hz` },
                { label: 'Sub energy', value: `${(nextStepsMeasurements.low_energy_ratio * 100).toFixed(0)}%` },
                { label: 'Transients', value: nextStepsMeasurements.transient_sharpness.toFixed(2) },
                { label: 'Dyn range',  value: `${nextStepsMeasurements.dynamic_range_db.toFixed(1)} dB` },
              ].map(b => (
                <div key={b.label} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '8px 14px', textAlign: 'center', minWidth: '80px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmest)', textTransform: 'uppercase', marginBottom: '4px' }}>{b.label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{b.value}</div>
                </div>
              ))}
            </div>
          )}

          {nextStepsResult && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ background: 'rgba(176,141,87,0.07)', border: '1px solid rgba(176,141,87,0.2)', padding: '5px 14px', fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
                  {nextStepsResult.detected_type}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-warm)', flex: 1, lineHeight: '1.5' }}>
                  {nextStepsResult.current_state}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {nextStepsResult.next_steps.map((step, i) => (
                  <div key={i} style={{
                    background: 'var(--bg)',
                    border: `1px solid ${step.priority === 1 ? 'rgba(176,141,87,0.3)' : step.priority === 2 ? 'rgba(61,107,74,0.25)' : 'var(--border-dim)'}`,
                    padding: '14px 18px', display: 'flex', gap: '16px', alignItems: 'flex-start',
                  }}>
                    <div style={{ flexShrink: 0, width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step.priority === 1 ? 'rgba(176,141,87,0.12)' : step.priority === 2 ? 'rgba(61,107,74,0.15)' : 'rgba(255,255,255,0.03)', fontSize: '11px', fontWeight: 700, color: step.priority === 1 ? 'var(--gold)' : step.priority === 2 ? 'var(--green)' : 'var(--text-dimmer)' }}>
                      {step.priority}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: step.priority === 1 ? 'var(--gold)' : step.priority === 2 ? 'var(--green)' : 'var(--text-dimmer)' }}>{step.area}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{step.action}</div>
                        {step.plugin && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '2px 8px', letterSpacing: '0.08em' }}>{step.plugin}</div>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 18px', background: 'var(--bg)', border: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmest)', textTransform: 'uppercase', flexShrink: 0 }}>Reference comparison</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dimmest)', fontStyle: 'italic' }}>Upload a reference track alongside your audio for a real measurement-based comparison</div>
              </div>
            </div>
          )}
        </div>

        <TrackUploader />

      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: '1px solid var(--border)', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 1000, backdropFilter: 'blur(16px)', minWidth: '240px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>{toast.tag}</div>
          <div style={{ fontSize: '13px', color: 'var(--text)' }}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
