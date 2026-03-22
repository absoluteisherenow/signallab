'use client'
import { TrackUploader } from './TrackUploader'

import { useState, useEffect, useRef } from 'react'

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

const STOCK_CHAINS: Record<string, string> = {
  'Vocal — Warmth': 'EQ Eight (high shelf +2dB @ 8kHz) → Compressor (4:1, soft knee) → Saturator (warm tube) → Reverb (small room)',
  'Vocal — Presence': 'EQ Eight (mid boost 2-4kHz) → Glue Compressor (2:1) → Echo (short pre-delay) → Utility (width)',
  'Vocal — Intimate': 'Channel EQ (low cut 80Hz) → Compressor (8:1 fast) → Saturator (light) → Reverb (med room)',
  'Vocal — Radio': 'EQ Eight (telephone filter) → Compressor (limiting) → Saturator (hard clip) → Utility',
  'Vocal — Depth': 'EQ Eight → Compressor → Echo (ping pong) → Reverb (large hall) → Utility (wide)',
  'Vocal — Dark': 'EQ Eight (high shelf -4dB) → Multiband Dynamics → Reverb (long tail)',
  'Vocal — Airy': 'EQ Eight (air shelf +3dB @ 16kHz) → Compressor (2:1) → Reverb (bright room)',
  'Vocal — Electronic': 'Redux (light bit crush) → Saturator → Auto Filter (band pass) → Echo',
  'Bass — Sub': 'EQ Eight (high cut 80Hz, low shelf boost) → Compressor (fast, 8:1) → Utility (mono)',
  'Bass — Midrange': 'EQ Eight (upper harmonics +3dB) → Glue Compressor → Saturator (light)',
  'Bass — Reese': 'Auto Filter (slow LFO) → Saturator → EQ Eight → Compressor',
  'Bass — Punch': 'Compressor (fast attack/release) → EQ Eight → Saturator (transient)',
  'Synth — Pad': 'EQ Eight → Compressor (slow) → Reverb (large) → Utility (wide) → Auto Pan',
  'Synth — Lead': 'EQ Eight (mid focus) → Compressor → Saturator → Echo (short)',
  'Synth — Texture': 'Redux → Reverb → Echo → Utility',
  'Drum — Room': 'Glue Compressor (parallel) → EQ Eight → Reverb (room) → Utility',
  'Drum — Electronic': 'Compressor (fast) → EQ Eight → Saturator → Utility (mono low)',
  'Reference': 'Multiband Dynamics (gentle) → EQ Eight (matching) → Limiter (-0.3dB)',
}

const CHAINS = [
  { name: 'Vocal — Warmth', type: 'vocal', desc: 'Vintage compression, harmonic saturation, air shelf' },
  { name: 'Vocal — Presence', type: 'vocal', desc: 'Forward mid push, de-ess, bright reverb tail' },
  { name: 'Vocal — Intimate', type: 'vocal', desc: 'Close-mic feel, subtle tape, room ambience' },
  { name: 'Vocal — Radio', type: 'vocal', desc: 'Aggressive limiting, telephonic character, punch' },
  { name: 'Vocal — Depth', type: 'vocal', desc: 'Wide stereo, long pre-delay, lush modulation' },
  { name: 'Vocal — Dark', type: 'vocal', desc: 'Low-mid body, rolled highs, dense reverb' },
  { name: 'Vocal — Airy', type: 'vocal', desc: 'High-shelf lift, minimal compression, open space' },
  { name: 'Vocal — Electronic', type: 'vocal', desc: 'Pitch character, bit colour, parallel distortion' },
  { name: 'Bass — Sub', type: 'bass', desc: 'Clean sub foundation, gentle limiting, no upper harmonics' },
  { name: 'Bass — Midrange', type: 'bass', desc: 'Upper harmonic focus, growl, speaker-friendly' },
  { name: 'Bass — Reese', type: 'bass', desc: 'Detuned character, dark modulation, movement' },
  { name: 'Bass — Punch', type: 'bass', desc: 'Transient snap, fast attack, tight release' },
  { name: 'Synth — Pad', type: 'synth', desc: 'Wide stereo, slow attack, soft harmonic sheen' },
  { name: 'Synth — Lead', type: 'synth', desc: 'Mono focus, mid presence, clean sustain' },
  { name: 'Synth — Texture', type: 'synth', desc: 'Granular movement, spectral interest, background depth' },
  { name: 'Drum — Room', type: 'drum', desc: 'Natural room glue, parallel compression, weight' },
  { name: 'Drum — Electronic', type: 'drum', desc: 'Tight transients, no room, surgical punch' },
  { name: 'Reference', type: 'ref', desc: 'LUFS matching, dynamic ceiling, true peak control' },
]

const CHORD_PROGRESSIONS = [
  { name: 'i — VI — III — VII', genre: 'Electronic / Minor', feel: 'Melancholic, driving' },
  { name: 'I — V — vi — IV', genre: 'Pop / Major', feel: 'Anthemic, familiar' },
  { name: 'i — VII — VI — VII', genre: 'Dark Electronic', feel: 'Tense, circular' },
  { name: 'ii — V — I — VI', genre: 'Jazz influenced', feel: 'Sophisticated, resolved' },
  { name: 'I — IV — I — V', genre: 'Minimal / Hypnotic', feel: 'Loop-friendly, trance' },
  { name: 'vi — IV — I — V', genre: 'Emotional Electronic', feel: 'Bittersweet, epic' },
]

export function SonixLab() {
  const [activeTab, setActiveTab] = useState<'compose' | 'arrange' | 'mixdown'>('compose')
  const [toast, setToast] = useState<{ msg: string; tag: string } | null>(null)
  const [reference, setReference] = useState('')
  const [referenceAnalysis, setReferenceAnalysis] = useState('')
  const [analysingReference, setAnalysingReference] = useState(false)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)

  // COMPOSE state
  const [key, setKey] = useState('A minor')
  const [genre, setGenre] = useState('Electronic')
  const [feel, setFeel] = useState('Melancholic')
  const [chordResult, setChordResult] = useState('')
  const [melodyResult, setMelodyResult] = useState('')
  const [generatingChords, setGeneratingChords] = useState(false)
  const [generatingMelody, setGeneratingMelody] = useState(false)
  const [selectedProgression, setSelectedProgression] = useState(0)

  // ARRANGE state
  const [trackContext, setTrackContext] = useState('')
  const [referenceTrack, setReferenceTrack] = useState('')
  const [arrangeResult, setArrangeResult] = useState('')
  const [energyArc, setEnergyArc] = useState<number[]>([])
  const [generatingArrange, setGeneratingArrange] = useState(false)

  // MIXDOWN state
  const [selectedChain, setSelectedChain] = useState<number | null>(null)
  const [chainContext, setChainContext] = useState('')
  const [chainResult, setChainResult] = useState('')
  const [generatingChain, setGeneratingChain] = useState(false)
  const [activeType, setActiveType] = useState<string>('all')
  const [meters, setMeters] = useState([0.3, 0.6, 0.4, 0.8, 0.5, 0.7])

  const showToast = (msg: string, tag = 'Info') => {
    setToast({ msg, tag })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }

  async function analyseReference() {
    if (!reference.trim()) { showToast('Enter a reference track first', 'Error'); return }
    setAnalysingReference(true)
    setReferenceAnalysis('')
    try {
      const raw = await callClaude('You are an expert music analyst. Be specific and practical.', 'Analyse this reference track for a producer wanting a similar style: ' + reference + '. Cover: key, BPM, arrangement structure, harmonic character, mix profile, energy arc, three defining production techniques.', 700)
      setReferenceAnalysis(raw)
      showToast('Reference analysed', 'Done')
    } catch (err) {
      showToast('Analysis failed', 'Error')
    } finally {
      setAnalysingReference(false)
    }
  }

  // Animate VU meters
  useEffect(() => {
    const interval = setInterval(() => {
      setMeters(prev => prev.map(m => Math.max(0.1, Math.min(0.95, m + (Math.random() - 0.5) * 0.15))))
    }, 150)
    return () => clearInterval(interval)
  }, [])

  async function generateChords() {
    setGeneratingChords(true)
    setChordResult('')
    try {
      const raw = await callClaude(
        `You are an expert music theorist and electronic music producer. Give practical, specific advice a producer can immediately use. Be concise but detailed.`,
        `Key: ${key}
Genre: ${genre}
Feel: ${feel}
Progression: ${CHORD_PROGRESSIONS[selectedProgression].name}

Give me:
1. Exact chord voicings (specific notes, not just chord names) for this progression in this key
2. Three variation ideas (tensions, extensions, substitutions)
3. A motif or riff idea that works over this progression
4. Suggested BPM range and rhythmic feel
5. Two reference tracks with a similar harmonic character

Keep it practical and producer-focused.`,
        600
      )
      setChordResult(raw)
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingChords(false)
    }
  }

  async function generateMelody() {
    setGeneratingMelody(true)
    setMelodyResult('')
    try {
      const raw = await callClaude(
        `You are a melody composer specialising in electronic music. Give specific, actionable note suggestions.`,
        `Key: ${key}
Genre: ${genre}
Feel: ${feel}
Underlying progression: ${CHORD_PROGRESSIONS[selectedProgression].name}
${chordResult ? 'Context from chord session: ' + chordResult.slice(0, 200) : ''}

Give me:
1. A specific melodic motif (describe the intervals and rhythm, e.g. "root, up a minor third, down a step, hold")
2. Two variations on that motif
3. A counter-melody idea
4. Scale/mode suggestions beyond the obvious
5. Articulation and expression tips for this genre`,
        500
      )
      setMelodyResult(raw)
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingMelody(false)
    }
  }

  async function generateArrangement() {
    setGeneratingArrange(true)
    setArrangeResult('')
    setEnergyArc([])
    try {
      const raw = await callClaude(
        `You are an expert electronic music arranger. Give a detailed, specific arrangement breakdown a producer can follow immediately. Respond with a JSON object.`,
        `Track context: ${trackContext || 'Electronic dance track, 128 BPM'}
Reference: ${referenceTrack || 'No reference provided'}
Genre: ${genre}

Return a JSON object with:
{
  "sections": [
    {"name": "Intro", "bars": 8, "energy": 2, "elements": "what's playing", "notes": "production tip"},
    ...continue through full track...
  ],
  "total_bars": number,
  "key_moments": ["drop at bar X", "breakdown at bar Y"],
  "production_tips": ["tip 1", "tip 2", "tip 3"],
  "reference_comparison": "how this compares to reference"
}
Energy is 1-10. Include: Intro, Build, Drop, Breakdown, Build 2, Drop 2, Outro at minimum.`,
        700
      )
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const data = JSON.parse(cleaned)
      setArrangeResult(raw)
      if (data.sections) {
        setEnergyArc(data.sections.map((s: any) => s.energy))
      }
    } catch (err: any) {
      try {
        setArrangeResult('')
      } catch {}
      showToast('Arrangement generated', 'Done')
    } finally {
      setGeneratingArrange(false)
    }
  }

  async function generateChainAdvice() {
    if (selectedChain === null) { showToast('Select a chain first', 'Error'); return }
    setGeneratingChain(true)
    setChainResult('')
    const chain = CHAINS[selectedChain]
    try {
      const raw = await callClaude(
        `You are an expert mix engineer with 20+ years experience in electronic music. Give specific, practical plugin settings and techniques.`,
        `Chain: ${chain.name}
Description: ${chain.desc}
Track context: ${chainContext || 'Electronic music production'}
Genre: ${genre}

Give me:
1. Specific plugin recommendations (with settings where possible)
2. Signal chain order with reasoning
3. Key frequency areas to focus on
4. Common mistakes to avoid with this chain
5. A "secret weapon" technique for this chain type
6. How to know when it's right (what to listen for)`,
        600
      )
      setChainResult(raw)
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'Error')
    } finally {
      setGeneratingChain(false)
    }
  }

  const filteredChains = activeType === 'all' ? CHAINS : CHAINS.filter(c => c.type === activeType)

  const typeColors: Record<string, string> = {
    vocal: '#b08d57',
    bass: '#5a8a6a',
    synth: '#6a7a9a',
    drum: '#9a6a5a',
    ref: '#7a6a8a',
  }

  return (
    <div className="min-h-screen text-[#e8dcc8]" style={{
      background: 'linear-gradient(180deg, #1a1410 0%, #120f0a 100%)',
      fontFamily: "'DM Mono', monospace",
    }}>

      {/* HEADER — hardware nameplate */}
      <div style={{
        background: 'linear-gradient(180deg, #2a2018 0%, #1e1710 100%)',
        borderBottom: '2px solid #3a2e20',
        boxShadow: '0 2px 20px rgba(0,0,0,0.5)',
      }} className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo plate */}
          <div style={{
            background: 'linear-gradient(135deg, #2e2416 0%, #1c1508 100%)',
            border: '1px solid #5a4428',
            boxShadow: 'inset 0 1px 0 rgba(255,200,100,0.1), 0 2px 8px rgba(0,0,0,0.4)',
            padding: '10px 20px',
          }}>
            <div style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '18px',
              fontWeight: '300',
              letterSpacing: '0.2em',
              color: '#c9a46e',
              textShadow: '0 0 20px rgba(201,164,110,0.4)',
            }}>SONIX <span style={{ color: '#8a6a3a' }}>LAB</span></div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: '#5a4428', marginTop: '2px' }}>
              MODULAR CREATIVE SUITE — MK.I
            </div>
          </div>

          {/* VU Meters */}
          <div className="flex items-end gap-1" style={{ height: '40px' }}>
            {meters.map((m, i) => (
              <div key={i} style={{ width: '6px', height: '40px', background: '#1a1208', border: '1px solid #2a1e10', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: `${m * 100}%`,
                  background: m > 0.8 ? '#c04030' : m > 0.6 ? '#c09030' : '#7a9a50',
                  transition: 'height 0.1s ease',
                  boxShadow: m > 0.6 ? `0 0 6px ${m > 0.8 ? '#c04030' : '#c09030'}` : 'none',
                }} />
              </div>
            ))}
          </div>

          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#3a2e20', textTransform: 'uppercase' }}>
            Input level
          </div>
        </div>

        {/* Tab selector — hardware buttons */}
        <div className="flex gap-1">
          {(['compose', 'arrange', 'mixdown'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '13px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '8px 20px',
              background: activeTab === tab
                ? 'linear-gradient(180deg, #3a2e1c 0%, #2a2010 100%)'
                : 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
              border: activeTab === tab ? '1px solid #7a5a28' : '1px solid #2a2010',
              color: activeTab === tab ? '#c9a46e' : '#4a3e28',
              boxShadow: activeTab === tab
                ? 'inset 0 1px 0 rgba(255,200,100,0.15), 0 0 10px rgba(201,164,110,0.1)'
                : 'inset 0 1px 0 rgba(0,0,0,0.3)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#3a2e20' }}>
          SIGNAL LAB — THE MODULAR SUITE
        </div>
      </div>

      <div className="p-8">

        {/* REFERENCE IMPORTER */}
        <div style={{
          background: 'linear-gradient(180deg, #2a2018 0%, #1e1710 100%)',
          border: '1px solid #5a4428',
          padding: '20px 28px',
          marginBottom: '24px',
          boxShadow: '0 0 20px rgba(201,164,110,0.05)',
        }}>
          <div style={{ fontSize: '13px', letterSpacing: '0.25em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'block', width: '20px', height: '1px', background: '#c9a46e' }} />
            Reference track analyser — the starting point
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <input value={reference} onChange={e => setReference(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') analyseReference() }}
                placeholder="Artist — Track name (e.g. Bicep — Glue, Four Tet — Baby)"
                style={{ width: '100%', background: '#0e0b06', border: '1px solid #5a4428', color: '#e8dcc8', fontFamily: "'DM Mono', monospace", fontSize: '13px', padding: '12px 16px', outline: 'none' }} />
            </div>
            <button onClick={analyseReference} disabled={analysingReference} style={{
              background: analysingReference ? '#1a1208' : 'linear-gradient(180deg, #4a3820 0%, #3a2810 100%)',
              border: '1px solid #c9a46e',
              color: '#c9a46e',
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '12px 28px',
              cursor: 'pointer',
              opacity: analysingReference ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 0 12px rgba(201,164,110,0.15)',
            }}>
              {analysingReference && <div style={{ width: '10px', height: '10px', border: '1px solid #c9a46e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {analysingReference ? 'Analysing...' : 'Analyse reference'}
            </button>
          </div>
          {referenceAnalysis && (
            <div style={{ marginTop: '16px', background: '#0e0b06', border: '1px solid #3a2e1c', padding: '16px 20px', maxHeight: '180px', overflowY: 'auto' }}>
              <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>{referenceAnalysis}</div>
            </div>
          )}
        </div>

        {/* ═══ COMPOSE TAB ═══ */}
        {activeTab === 'compose' && (
          <div className="flex flex-col gap-6">

            {/* CONTROLS ROW */}
            <div style={{
              background: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
              border: '1px solid #3a2e1c',
              padding: '24px 28px',
              boxShadow: 'inset 0 1px 0 rgba(255,200,100,0.05)',
            }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.25em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #2a2010' }}>
                Harmonic parameters
              </div>
              <div className="grid grid-cols-4 gap-6">
                {[
                  { label: 'Key / Mode', value: key, onChange: setKey, options: ['A minor', 'C major', 'D minor', 'E minor', 'F major', 'G major', 'B minor', 'Eb major', 'F# minor', 'Bb major', 'C# minor', 'Ab major'] },
                  { label: 'Genre', value: genre, onChange: setGenre, options: ['Electronic', 'Deep House', 'Techno', 'Ambient', 'Drum & Bass', 'UK Garage', 'Afrobeats', 'Hip Hop', 'Pop', 'R&B', 'Jazz', 'Classical'] },
                  { label: 'Emotional feel', value: feel, onChange: setFeel, options: ['Melancholic', 'Euphoric', 'Tense', 'Dreamy', 'Aggressive', 'Soulful', 'Minimal', 'Epic', 'Intimate', 'Hypnotic'] },
                ].map(field => (
                  <div key={field.label}>
                    <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '8px' }}>{field.label}</div>
                    <select value={field.value} onChange={e => field.onChange(e.target.value)} style={{
                      width: '100%',
                      background: '#0e0b06',
                      border: '1px solid #3a2e1c',
                      color: '#e8dcc8',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '14px',
                      padding: '8px 12px',
                      outline: 'none',
                    }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '8px' }}>Actions</div>
                  <div className="flex gap-2">
                    <button onClick={generateChords} disabled={generatingChords} style={{
                      flex: 1,
                      background: generatingChords ? '#1a1208' : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                      border: '1px solid #6a4e28',
                      color: '#c9a46e',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '11px',
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      padding: '8px',
                      cursor: 'pointer',
                      opacity: generatingChords ? 0.5 : 1,
                    }}>
                      {generatingChords ? '...' : 'Chords'}
                    </button>
                    <button onClick={generateMelody} disabled={generatingMelody} style={{
                      flex: 1,
                      background: generatingMelody ? '#1a1208' : 'linear-gradient(180deg, #2a3020 0%, #1a2010 100%)',
                      border: '1px solid #4a6a38',
                      color: '#8aba68',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '11px',
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      padding: '8px',
                      cursor: 'pointer',
                      opacity: generatingMelody ? 0.5 : 1,
                    }}>
                      {generatingMelody ? '...' : 'Melody'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* PROGRESSIONS */}
            <div style={{ background: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)', border: '1px solid #3a2e1c', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '16px' }}>
                Chord progressions — {key}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {CHORD_PROGRESSIONS.map((prog, i) => (
                  <div key={i} onClick={() => setSelectedProgression(i)} style={{
                    background: selectedProgression === i ? 'linear-gradient(180deg, #2e2416 0%, #1e1508 100%)' : '#0e0b06',
                    border: selectedProgression === i ? '1px solid #7a5a28' : '1px solid #2a2010',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: selectedProgression === i ? '0 0 12px rgba(201,164,110,0.1)' : 'none',
                  }}>
                    <div style={{ fontSize: '14px', letterSpacing: '0.05em', color: selectedProgression === i ? '#c9a46e' : '#8a7a5a', marginBottom: '6px', fontWeight: '400' }}>{prog.name}</div>
                    <div style={{ fontSize: '13px', letterSpacing: '0.1em', color: '#5a4428', marginBottom: '3px' }}>{prog.genre}</div>
                    <div style={{ fontSize: '13px', letterSpacing: '0.08em', color: '#4a3e28', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{prog.feel}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RESULTS */}
            {chordResult && (
              <div style={{ background: '#0e0b06', border: '1px solid #3a2e1c', padding: '24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #2a2010' }}>
                  Chord analysis
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>
                  {chordResult.replace(/\*\*/g,"").replace(/^#{1,3} /gm,"").replace(/^---$/gm,"─────────")}
                </div>
              </div>
            )}
            {melodyResult && (
              <div style={{ background: '#0e0b06', border: '1px solid #2a3020', padding: '24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#8aba68', textTransform: 'uppercase', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #1a2010' }}>
                  Melody ideas
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>
                  {melodyResult.replace(/\*\*/g,"").replace(/^#{1,3} /gm,"").replace(/^---$/gm,"─────────")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ ARRANGE TAB ═══ */}
        {activeTab === 'arrange' && (
          <div className="flex flex-col gap-6">

            <div style={{ background: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)', border: '1px solid #3a2e1c', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #2a2010' }}>
                Track parameters
              </div>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '8px' }}>Track context</div>
                  <input value={trackContext} onChange={e => setTrackContext(e.target.value)}
                    placeholder="128 BPM techno, dark and driving, 6 min DJ tool..."
                    style={{ width: '100%', background: '#0e0b06', border: '1px solid #3a2e1c', color: '#e8dcc8', fontFamily: "'DM Mono', monospace", fontSize: '13px', padding: '10px 12px', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '8px' }}>Reference track</div>
                  <input value={referenceTrack} onChange={e => setReferenceTrack(e.target.value)}
                    placeholder="Artist — Track name"
                    style={{ width: '100%', background: '#0e0b06', border: '1px solid #3a2e1c', color: '#e8dcc8', fontFamily: "'DM Mono', monospace", fontSize: '13px', padding: '10px 12px', outline: 'none' }} />
                </div>
              </div>
              <button onClick={generateArrangement} disabled={generatingArrange} style={{
                background: generatingArrange ? '#1a1208' : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                border: '1px solid #6a4e28',
                color: '#c9a46e',
                fontFamily: "'DM Mono', monospace",
                fontSize: '13px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                padding: '12px 28px',
                cursor: 'pointer',
                opacity: generatingArrange ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                {generatingArrange && <div style={{ width: '10px', height: '10px', border: '1px solid #c9a46e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {generatingArrange ? 'Analysing structure...' : 'Generate arrangement'}
              </button>
            </div>

            {/* ENERGY ARC VISUALISER */}
            {energyArc.length > 0 && (
              <div style={{ background: '#0e0b06', border: '1px solid #3a2e1c', padding: '24px 28px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '20px' }}>
                  Energy arc
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                  {energyArc.map((e, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{
                        width: '100%',
                        height: `${(e / 10) * 72}px`,
                        background: e > 7 ? 'linear-gradient(180deg, #c9a46e, #8a6030)' : e > 4 ? 'linear-gradient(180deg, #6a8a50, #3a5020)' : 'linear-gradient(180deg, #3a3020, #1a1810)',
                        border: '1px solid rgba(201,164,110,0.2)',
                        transition: 'height 0.5s ease',
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ARRANGEMENT RESULT */}
            {arrangeResult && (
              <div style={{ background: '#0e0b06', border: '1px solid #3a2e1c', padding: '24px 28px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #2a2010' }}>
                  Arrangement map
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>
                  {(() => {
                    try {
                      const d = JSON.parse(arrangeResult.replace(/```json|```/g, '').trim())
                      return (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
                            {d.sections?.map((s: any, i: number) => (
                              <div key={i} style={{ background: '#1a1208', border: '1px solid #2a2010', padding: '12px' }}>
                                <div style={{ fontSize: '13px', letterSpacing: '0.15em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '6px' }}>{s.name}</div>
                                <div style={{ fontSize: '10px', color: '#6a5a3a', marginBottom: '4px' }}>{s.bars} bars · E:{s.energy}/10</div>
                                <div style={{ fontSize: '10px', color: '#8a7a5a', lineHeight: '1.5' }}>{s.elements}</div>
                                {s.notes && <div style={{ fontSize: '13px', color: '#5a4a28', marginTop: '6px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{s.notes}</div>}
                              </div>
                            ))}
                          </div>
                          {d.production_tips && (
                            <div>
                              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '10px' }}>Production tips</div>
                              {d.production_tips.map((tip: string, i: number) => (
                                <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #1a1208', fontSize: '13px', color: '#8a7a5a' }}>
                                  <span style={{ color: '#c9a46e', opacity: 0.6 }}>→</span>{tip}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    } catch {
                      return arrangeResult
                    }
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ MIXDOWN TAB ═══ */}
        {activeTab === 'mixdown' && (
          <div className="flex flex-col gap-6">

            {/* CHAIN TYPE FILTER */}
            <div style={{ background: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)', border: '1px solid #3a2e1c', padding: '20px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '16px' }}>
                18 production chains
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                {['all', 'vocal', 'bass', 'synth', 'drum', 'ref'].map(t => (
                  <button key={t} onClick={() => setActiveType(t)} style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '10px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    padding: '6px 14px',
                    background: activeType === t ? 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)' : '#0e0b06',
                    border: activeType === t ? `1px solid ${typeColors[t] || '#6a4e28'}` : '1px solid #2a2010',
                    color: activeType === t ? (typeColors[t] || '#c9a46e') : '#4a3e28',
                    cursor: 'pointer',
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {filteredChains.map((chain, idx) => {
                  const realIdx = CHAINS.indexOf(chain)
                  return (
                    <div key={realIdx} onClick={() => setSelectedChain(realIdx)} style={{
                      background: selectedChain === realIdx ? 'linear-gradient(180deg, #2e2416 0%, #1e1508 100%)' : '#0e0b06',
                      border: selectedChain === realIdx ? `1px solid ${typeColors[chain.type] || '#6a4e28'}` : '1px solid #2a2010',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontSize: '13px', letterSpacing: '0.06em', color: selectedChain === realIdx ? '#e8dcc8' : '#8a7a5a' }}>{chain.name}</div>
                        <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: typeColors[chain.type] || '#5a4428', textTransform: 'uppercase', flexShrink: 0, marginLeft: '8px' }}>{chain.type}</div>
                      </div>
                      <div style={{ fontSize: '13px', letterSpacing: '0.06em', color: '#4a3e28', fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: '1.4' }}>{chain.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CHAIN CONTEXT + GENERATE */}
            {selectedChain !== null && (
              <div style={{ background: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)', border: '1px solid #3a2e1c', padding: '24px 28px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '16px' }}>
                  {CHAINS[selectedChain].name} — chain detail
                </div>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#5a4428', textTransform: 'uppercase', marginBottom: '8px' }}>Track context</div>
                    <input value={chainContext} onChange={e => setChainContext(e.target.value)}
                      placeholder="What are you mixing? Genre, style, BPM..."
                      style={{ width: '100%', background: '#0e0b06', border: '1px solid #3a2e1c', color: '#e8dcc8', fontFamily: "'DM Mono', monospace", fontSize: '13px', padding: '10px 12px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={generateChainAdvice} disabled={generatingChain} style={{
                      background: generatingChain ? '#1a1208' : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                      border: '1px solid #6a4e28',
                      color: '#c9a46e',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '13px',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      padding: '12px 28px',
                      cursor: 'pointer',
                      opacity: generatingChain ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}>
                      {generatingChain && <div style={{ width: '10px', height: '10px', border: '1px solid #c9a46e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                      {generatingChain ? 'Analysing...' : 'Get chain advice'}
                    </button>
                  </div>
                </div>

                {chainResult && (
                  <div style={{ background: '#0e0b06', border: '1px solid #2a2010', padding: '20px' }}>
                    <div style={{ fontSize: '13px', lineHeight: '1.85', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>
                      {chainResult.replace(/\*\*/g,"").replace(/^#{1,3} /gm,"").replace(/^---$/gm,"─────────")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '28px',
          background: 'rgba(20,16,8,0.96)',
          border: '1px solid #3a2e1c',
          padding: '14px 20px',
          fontSize: '13px', letterSpacing: '0.07em',
          color: '#e8dcc8',
          zIndex: 50,
          maxWidth: '280px',
          lineHeight: '1.55',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a46e', marginBottom: '4px' }}>{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      <TrackUploader />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #1a1208; }
      `}</style>
    </div>
  )
}
