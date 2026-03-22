'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

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

interface Track {
  id: string
  title: string
  artist: string
  bpm: number
  key: string
  camelot: string
  energy: number
  genre: string
  duration: string
  notes: string
  analysed: boolean
}

interface SetTrack extends Track {
  position: number
  transition_note: string
  compatibility: number
}

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

function getCompatibilityColor(score: number): string {
  if (score >= 85) return '#7a9a50'
  if (score >= 60) return '#c9a46e'
  return '#8a4a3a'
}

const SAMPLE_LIBRARY: Track[] = [
  { id: '1', title: 'Glue', artist: 'Bicep', bpm: 122, key: 'F minor', camelot: '4A', energy: 7, genre: 'Electronic', duration: '5:42', notes: 'Perfect opener — builds slowly', analysed: true },
  { id: '2', title: 'For', artist: 'Four Tet', bpm: 128, key: 'A minor', camelot: '8A', energy: 6, genre: 'Electronic', duration: '6:15', notes: '', analysed: true },
  { id: '3', title: 'Strands', artist: 'Floating Points', bpm: 130, key: 'D minor', camelot: '7A', energy: 8, genre: 'Electronic', duration: '7:20', notes: 'Crowd always reacts to the drop', analysed: true },
  { id: '4', title: 'Marea', artist: 'Fred again..', bpm: 132, key: 'C major', camelot: '8B', energy: 9, genre: 'Electronic', duration: '4:55', notes: 'Peak time only', analysed: true },
  { id: '5', title: 'Kexp', artist: 'Bicep', bpm: 126, key: 'Bb minor', camelot: '2A', energy: 8, genre: 'Electronic', duration: '6:30', notes: '', analysed: true },
  { id: '6', title: 'Baby', artist: 'Four Tet', bpm: 124, key: 'G major', camelot: '9B', energy: 5, genre: 'Electronic', duration: '5:10', notes: 'Great for early set or cool-down', analysed: true },
  { id: '7', title: 'LNR', artist: 'Floating Points', bpm: 134, key: 'E minor', camelot: '9A', energy: 9, genre: 'Techno', duration: '8:05', notes: '', analysed: true },
  { id: '8', title: 'Jungle', artist: 'Drake feat. Tems', bpm: 120, key: 'G minor', camelot: '6A', energy: 7, genre: 'Afrobeats', duration: '3:45', notes: 'Crowd pleaser — use sparingly', analysed: true },
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
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', bpm: '', key: '', camelot: '', energy: '5', genre: 'Electronic', duration: '' })
  const [analysingTrack, setAnalysingTrack] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tag: string } | null>(null)
  const [pastSets, setPastSets] = useState<any[]>([])
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)

  const showToast = (msg: string, tag = 'Info') => {
    setToast({ msg, tag })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }

  const filteredLibrary = library.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.genre.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function addToSet(track: Track) {
    const prev = set[set.length - 1]
    const compatibility = prev ? getCompatibility(prev.camelot, track.camelot) : 100
    const setTrack: SetTrack = { ...track, position: set.length + 1, transition_note: '', compatibility }
    setSet(s => [...s, setTrack])
    showToast(`${track.title} added to set`, 'Set')
  }

  function removeFromSet(id: string) {
    setSet(s => s.filter(t => t.id !== id).map((t, i) => ({ ...t, position: i + 1 })))
  }

  async function analyseAndAddTrack() {
    if (!newTrack.title || !newTrack.artist) { showToast('Title and artist required', 'Error'); return }
    setAnalysingTrack(true)
    try {
      const raw = await callClaude(
        'You are a music data expert. Return ONLY valid JSON, no markdown.',
        `Analyse this track and return its musical properties:
Track: ${newTrack.artist} — ${newTrack.title}
Return JSON: {"bpm": number, "key": "key name", "camelot": "camelot code e.g. 4A", "energy": number 1-10, "genre": "genre", "duration": "M:SS", "notes": "one sentence about how/when to use this track in a DJ set"}`
        , 200)
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const track: Track = {
        id: Date.now().toString(),
        title: newTrack.title,
        artist: newTrack.artist,
        bpm: d.bpm || parseInt(newTrack.bpm) || 128,
        key: d.key || newTrack.key,
        camelot: d.camelot || newTrack.camelot,
        energy: d.energy || parseInt(newTrack.energy) || 5,
        genre: d.genre || newTrack.genre,
        duration: d.duration || newTrack.duration || '5:00',
        notes: d.notes || '',
        analysed: true,
      }
      setLibrary(prev => [...prev, track])
      setNewTrack({ title: '', artist: '', bpm: '', key: '', camelot: '', energy: '5', genre: 'Electronic', duration: '' })
      setAddingTrack(false)
      showToast(`${track.title} analysed and added`, 'Done')
    } catch (err: any) {
      showToast('Analysis failed: ' + err.message, 'Error')
    } finally {
      setAnalysingTrack(false)
    }
  }

  async function generateSetNarrative() {
    if (set.length < 3) { showToast('Add at least 3 tracks first', 'Error'); return }
    setGeneratingNarrative(true)
    setNarrative('')
    try {
      const trackList = set.map((t, i) => `${i + 1}. ${t.artist} — ${t.title} (${t.bpm}BPM, ${t.camelot}, Energy: ${t.energy}/10)`).join('\n')
      const raw = await callClaude(
        'You are an expert DJ coach and music analyst. Give specific, actionable feedback on DJ set construction.',
        `Analyse this DJ set:

Venue/Slot: ${slotType}
Set length: ${setLength} minutes
${venue ? 'Venue: ' + venue : ''}

Tracklist:
${trackList}

Provide:
1. Overall arc assessment — does this set tell a story?
2. Key transition moments — which transitions are strong/weak and why
3. Energy curve analysis — is the pacing right for this slot?
4. Harmonic journey — how does the key progression feel?
5. Three specific improvements
6. The emotional narrative of this set in 2-3 sentences`
        , 700)
      setNarrative(raw)
    } catch (err: any) {
      showToast('Failed: ' + err.message, 'Error')
    } finally {
      setGeneratingNarrative(false)
    }
  }

  async function saveSet() {
    if (!set.length) { showToast('Nothing to save', 'Error'); return }
    const setData = {
      name: setName,
      venue,
      slot_type: slotType,
      tracks: JSON.stringify(set),
      narrative,
      created_at: new Date().toISOString(),
    }
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

  const s = {
    bg: '#1a1410',
    panel: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
    border: '#3a2e1c',
    borderBright: '#5a4428',
    gold: '#c9a46e',
    goldDim: '#6a4e28',
    text: '#e8dcc8',
    textDim: '#8a7a5a',
    textDimmer: '#5a4428',
    black: '#0e0b06',
    font: "'DM Mono', monospace",
  }

  const btn = (color = s.gold, bg = 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)') => ({
    fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
    padding: '10px 22px', background: bg, border: `1px solid ${color}`, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '8px',
  })

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: s.font }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(180deg, #2a2018 0%, #1e1710 100%)', borderBottom: `2px solid ${s.borderBright}`, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #2e2416 0%, #1c1508 100%)', border: `1px solid ${s.borderBright}`, padding: '10px 20px' }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 300, letterSpacing: '0.2em', color: s.gold, textShadow: '0 0 20px rgba(201,164,110,0.3)' }}>SET<span style={{ color: '#8a6a3a' }}>LAB</span></div>
            <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.goldDim, marginTop: '2px' }}>INTELLIGENT DJ COMPANION</div>
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.textDimmer }}>
            {library.length} tracks · {set.length} in set · {setLength}min slot
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['library', 'builder', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...btn(activeTab === tab ? s.gold : s.goldDim, activeTab === tab ? 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)' : 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)'),
              fontSize: '9px', padding: '8px 18px',
              boxShadow: activeTab === tab ? '0 0 10px rgba(201,164,110,0.1)' : 'none',
            }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={saveSet} style={btn(s.gold)}>Save set</button>
          <button onClick={() => showToast('Rekordbox export coming soon — set will export as crate', 'Export')} style={btn('#6a8a50', 'linear-gradient(180deg, #2a3020 0%, #1a2010 100%)')}>
            Export to rekordbox →
          </button>
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>

        {/* ═══ LIBRARY TAB ═══ */}
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Search + Add */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tracks, artists, genres..."
                style={{ flex: 1, background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '12px 16px', outline: 'none' }} />
              <button onClick={() => setAddingTrack(!addingTrack)} style={btn(s.gold)}>
                {addingTrack ? 'Cancel' : '+ Add track'}
              </button>
            </div>

            {/* Add track form */}
            {addingTrack && (
              <div style={{ background: s.panel, border: `1px solid ${s.borderBright}`, padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Add track — Claude will analyse key, BPM, energy</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: 'Track title', key: 'title', placeholder: 'Track name' },
                    { label: 'Artist', key: 'artist', placeholder: 'Artist name' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.label}</div>
                      <input value={newTrack[f.key as keyof typeof newTrack]} onChange={e => setNewTrack(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px 12px', outline: 'none' }} />
                    </div>
                  ))}
                </div>
                <button onClick={analyseAndAddTrack} disabled={analysingTrack} style={{ ...btn(s.gold), opacity: analysingTrack ? 0.5 : 1 }}>
                  {analysingTrack && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                  {analysingTrack ? 'Analysing...' : 'Analyse & add'}
                </button>
              </div>
            )}

            {/* Track library */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 80px 80px 80px 60px 1fr 80px', gap: '0', padding: '12px 20px', borderBottom: `1px solid ${s.border}` }}>
                {['Track', 'Artist', 'BPM', 'Key', 'Camelot', 'Energy', 'Notes', ''].map(h => (
                  <div key={h} style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {filteredLibrary.map(track => (
                <div key={track.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 80px 80px 80px 60px 1fr 80px', gap: '0', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1410')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: '13px', letterSpacing: '0.05em', color: s.text }}>{track.title}</div>
                  <div style={{ fontSize: '12px', color: s.textDim }}>{track.artist}</div>
                  <div style={{ fontSize: '12px', color: s.textDim }}>{track.bpm}</div>
                  <div style={{ fontSize: '11px', color: s.textDim }}>{track.key}</div>
                  <div style={{ fontSize: '12px', color: s.gold, fontWeight: 400 }}>{track.camelot}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ flex: 1, height: '3px', background: s.border, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '3px', width: `${track.energy * 10}%`, background: track.energy > 7 ? '#c9a46e' : track.energy > 4 ? '#6a8a50' : '#4a5a6a' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: s.textDimmer }}>{track.energy}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer, fontStyle: 'italic', fontFamily: 'Georgia, serif', paddingRight: '12px' }}>{track.notes}</div>
                  <button onClick={() => addToSet(track)} style={{ ...btn(s.gold), fontSize: '8px', padding: '6px 12px' }}>Add →</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SET BUILDER TAB ═══ */}
        {activeTab === 'builder' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>

            {/* Set */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Set config */}
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Set name', value: setName, onChange: setSetName, placeholder: 'My Set' },
                    { label: 'Venue', value: venue, onChange: setVenue, placeholder: 'Fabric, London' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.label}</div>
                      <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                        style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Slot type</div>
                    <select value={slotType} onChange={e => setSlotType(e.target.value)}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }}>
                      {['Club — peak time', 'Club — warm up', 'Club — closing', 'Festival — main stage', 'Festival — second stage', 'Festival — opening', 'Private event', 'Livestream'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Length (mins)</div>
                    <select value={setLength} onChange={e => setSetLength(e.target.value)}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }}>
                      {['30', '45', '60', '90', '120', '180'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Energy arc */}
              {set.length > 1 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '16px 24px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>Energy arc</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
                    {set.map((t, i) => (
                      <div key={t.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                          width: '100%',
                          height: `${(t.energy / 10) * 52}px`,
                          background: t.energy > 7 ? 'linear-gradient(180deg, #c9a46e, #8a6030)' : t.energy > 4 ? 'linear-gradient(180deg, #6a8a50, #3a5020)' : 'linear-gradient(180deg, #3a3020, #1a1810)',
                          border: '1px solid rgba(201,164,110,0.15)',
                          transition: 'height 0.4s ease',
                        }} />
                        <div style={{ fontSize: '8px', color: s.textDimmer }}>{i + 1}</div>
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
                    const compat = next ? getCompatibility(track.camelot, next.camelot) : null
                    return (
                      <div key={track.id}>
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1.2fr 70px 70px 70px 50px auto', gap: '0', padding: '14px 20px', borderBottom: `1px solid ${s.border}` }}>
                          <div style={{ fontSize: '12px', color: s.textDimmer, display: 'flex', alignItems: 'center' }}>{i + 1}</div>
                          <div>
                            <div style={{ fontSize: '13px', color: s.text }}>{track.title}</div>
                            <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                          </div>
                          <div style={{ fontSize: '11px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.artist}</div>
                          <div style={{ fontSize: '12px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.bpm}</div>
                          <div style={{ fontSize: '12px', color: s.gold, display: 'flex', alignItems: 'center' }}>{track.camelot}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '32px', height: '3px', background: s.border, position: 'relative' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, height: '3px', width: `${track.energy * 10}%`, background: track.energy > 7 ? s.gold : '#6a8a50' }} />
                            </div>
                            <span style={{ fontSize: '10px', color: s.textDimmer }}>{track.energy}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {track.compatibility < 100 && (
                              <div style={{ fontSize: '10px', color: getCompatibilityColor(track.compatibility), letterSpacing: '0.1em' }}>{track.compatibility}%</div>
                            )}
                          </div>
                          <button onClick={() => removeFromSet(track.id)} style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '14px', padding: '0 8px' }}>×</button>
                        </div>
                        {compat !== null && compat < 85 && (
                          <div style={{ padding: '6px 20px 6px 48px', background: 'rgba(138,74,58,0.1)', borderBottom: `1px solid ${s.border}`, fontSize: '10px', color: '#8a6a5a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#8a4a3a' }}>⚠</span>
                            Transition to {next?.title}: {compat}% compatible ({track.camelot} → {next?.camelot})
                            {compat < 50 && ' — consider a different order or a bridge track'}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* AI NARRATIVE PANEL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Set intelligence</div>
                <button onClick={generateSetNarrative} disabled={generatingNarrative || set.length < 3} style={{ ...btn(s.gold), width: '100%', justifyContent: 'center', opacity: set.length < 3 ? 0.4 : 1 }}>
                  {generatingNarrative && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                  {generatingNarrative ? 'Analysing set...' : 'Analyse my set'}
                </button>
                {set.length < 3 && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '8px', textAlign: 'center' }}>Add {3 - set.length} more track{3 - set.length > 1 ? 's' : ''} to analyse</div>}

                {narrative && (
                  <div style={{ marginTop: '16px', borderTop: `1px solid ${s.border}`, paddingTop: '16px' }}>
                    <div style={{ fontSize: '11px', lineHeight: '1.8', color: '#a89878', whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>{narrative}</div>
                  </div>
                )}
              </div>

              {/* Quick stats */}
              {set.length > 0 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Set stats</div>
                  {[
                    { label: 'Tracks', val: set.length },
                    { label: 'Avg BPM', val: Math.round(set.reduce((a, t) => a + t.bpm, 0) / set.length) },
                    { label: 'Avg energy', val: (set.reduce((a, t) => a + t.energy, 0) / set.length).toFixed(1) },
                    { label: 'BPM range', val: `${Math.min(...set.map(t => t.bpm))}–${Math.max(...set.map(t => t.bpm))}` },
                    { label: 'Peak energy', val: Math.max(...set.map(t => t.energy)) + '/10' },
                    { label: 'Weak transitions', val: set.filter(t => t.compatibility < 60).length },
                  ].map(stat => (
                    <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${s.border}`, fontSize: '12px' }}>
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
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Past sets</div>
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
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(20,16,8,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', letterSpacing: '0.07em', color: s.text, zIndex: 50, maxWidth: '280px', lineHeight: '1.55', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } select option { background: #1a1208; }`}</style>
    </div>
  )
}
