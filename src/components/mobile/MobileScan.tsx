'use client'

import { useState, useRef } from 'react'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

interface Track {
  artist: string
  title: string
}

type Phase = 'choose' | 'parsing' | 'review' | 'saved' | 'analysing' | 'analysed'

export default function MobileScan() {
  const [phase, setPhase] = useState<Phase>('choose')
  const [tracks, setTracks] = useState<Track[]>([])
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleScreenshot(file: File) {
    setPhase('parsing')
    setError('')
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: 'Extract the tracklist from this image. This might be CDJ screens, Rekordbox, Traktor, a Spotify/SoundCloud playlist, or handwritten notes. Return a JSON array of objects with "artist" and "title" fields. Only include tracks you can clearly read. Return ONLY the JSON array, no other text.' },
            ],
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No tracks found')
      setTracks(JSON.parse(jsonMatch[0]))
      setPhase('review')
    } catch {
      setError('Could not read tracks — try a clearer photo')
      setPhase('choose')
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return
    setPhase('parsing')
    setError('')
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Parse this into a tracklist. Return a JSON array of objects with "artist" and "title" fields. If the format is ambiguous, make your best guess. Return ONLY the JSON array.\n\n${pasteText}`,
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No tracks found')
      setTracks(JSON.parse(jsonMatch[0]))
      setPhase('review')
      setShowPaste(false)
    } catch {
      setError('Could not parse tracks — try a different format')
      setPhase('choose')
    }
  }

  function updateTrack(i: number, field: 'artist' | 'title', value: string) {
    setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  function removeTrack(i: number) {
    setTracks(prev => prev.filter((_, idx) => idx !== i))
  }

  async function savePlaylist() {
    const valid = tracks.filter(t => t.artist.trim() || t.title.trim())
    if (valid.length === 0) return
    const playlists = JSON.parse(localStorage.getItem('signallab_playlists') || '[]')
    playlists.unshift({
      id: Date.now().toString(),
      name: name.trim() || `Tracklist ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      tracks: valid,
      created_at: new Date().toISOString(),
    })
    localStorage.setItem('signallab_playlists', JSON.stringify(playlists))
    setPhase('saved')
  }

  async function analyseMix() {
    const valid = tracks.filter(t => t.artist.trim() || t.title.trim())
    if (valid.length === 0) return
    setPhase('analysing')
    try {
      const tracklist = valid.map((t, i) => `${i + 1}. ${t.artist} — ${t.title}`).join('\n')
      const res = await fetch('/api/mix-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracklist }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysisResult(data.result)
      setPhase('analysed')
    } catch {
      setError('Analysis failed — try again')
      setPhase('review')
    }
  }

  function scoreColor(score: number) {
    if (score >= 8) return '#4ecb71'
    if (score >= 6) return 'var(--gold)'
    if (score >= 4) return '#c9a46e'
    return '#c06060'
  }

  function reset() {
    setPhase('choose')
    setTracks([])
    setPasteText('')
    setShowPaste(false)
    setAnalysisResult(null)
    setName('')
    setError('')
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, color: s.text, paddingBottom: '80px' }}>

      {/* Header */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '26px', fontWeight: 300, marginBottom: '6px' }}>
          Scan
        </div>
        <div style={{ fontSize: '12px', color: s.dimmer }}>
          Grab tracks, build playlists, analyse mixes
        </div>
      </div>

      {/* Choose method */}
      {phase === 'choose' && (
        <div style={{ padding: '0 16px' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshot(f) }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'
                inp.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0]
                  if (f) handleScreenshot(f)
                }
                inp.click()
              }}
              style={{
                background: s.panel, border: `1px solid ${s.border}`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>◉</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Track ID Thief</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Snap the decks, CDJs, or laptop</div>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              style={{
                background: s.panel, border: `1px solid ${s.border}`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>↑</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Playlist Screen Grab</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Spotify, SoundCloud, Beatport playlist</div>
              </div>
            </button>

            <button
              onClick={() => setShowPaste(true)}
              style={{
                background: s.panel, border: `1px solid ${s.border}`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>≡</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Paste tracklist</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Copy from anywhere, any format</div>
              </div>
            </button>

            <button
              onClick={() => { setTracks([{ artist: '', title: '' }]); setPhase('review') }}
              style={{
                background: s.panel, border: `1px solid ${s.border}`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>+</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Add manually</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Type tracks one by one</div>
              </div>
            </button>
          </div>

          {/* Paste overlay */}
          {showPaste && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)', zIndex: 100,
              display: 'flex', flexDirection: 'column', padding: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase' }}>Paste tracklist</div>
                <button onClick={() => setShowPaste(false)} style={{
                  background: 'none', border: 'none', color: s.dimmer, fontSize: '12px', cursor: 'pointer', fontFamily: s.font,
                }}>Cancel</button>
              </div>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'Paste tracks here — any format works\n\nArtist - Title\n1. Artist — Title\nor just a copied playlist...'}
                autoFocus
                style={{
                  flex: 1, background: s.panel, border: `1px solid ${s.border}`,
                  color: s.text, fontFamily: s.font, fontSize: '14px', padding: '16px',
                  outline: 'none', resize: 'none', lineHeight: 1.8,
                }}
              />
              <button
                onClick={handlePaste}
                disabled={!pasteText.trim()}
                style={{
                  marginTop: '12px', background: s.gold, color: '#070706', border: 'none',
                  padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
                  textTransform: 'uppercase', fontFamily: s.font,
                  cursor: pasteText.trim() ? 'pointer' : 'default',
                  opacity: pasteText.trim() ? 1 : 0.4,
                }}
              >
                Parse tracks
              </button>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px', background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', fontSize: '12px', color: '#c04040' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Parsing */}
      {phase === 'parsing' && (
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Reading tracks...
          </div>
        </div>
      )}

      {/* Review & edit tracks */}
      {phase === 'review' && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ marginBottom: '16px' }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Playlist name (optional)"
              style={{
                width: '100%', background: 'transparent', border: `1px solid ${s.border}`,
                color: s.text, fontFamily: s.font, fontSize: '14px',
                padding: '14px 16px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
            {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {tracks.map((t, i) => (
              <div key={i} style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: s.dimmer, width: '22px', paddingTop: '10px', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <input value={t.artist} onChange={e => updateTrack(i, 'artist', e.target.value)}
                      placeholder="Artist" style={{
                        width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${s.border}`,
                        color: s.dim, fontFamily: s.font, fontSize: '13px', padding: '8px 0', outline: 'none', boxSizing: 'border-box',
                      }} />
                    <input value={t.title} onChange={e => updateTrack(i, 'title', e.target.value)}
                      placeholder="Title" style={{
                        width: '100%', background: 'transparent', border: 'none',
                        color: s.text, fontFamily: s.font, fontSize: '13px', padding: '8px 0', outline: 'none', boxSizing: 'border-box',
                      }} />
                  </div>
                  <button onClick={() => removeTrack(i)} style={{
                    background: 'none', border: 'none', color: s.dimmer, fontSize: '14px',
                    cursor: 'pointer', padding: '8px', alignSelf: 'flex-start',
                  }}>x</button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setTracks(prev => [...prev, { artist: '', title: '' }])} style={{
            width: '100%', background: 'transparent', border: `1px dashed ${s.border}`,
            color: s.dim, fontFamily: s.font, fontSize: '12px', padding: '14px',
            cursor: 'pointer', marginBottom: '16px',
          }}>
            + Add track
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={savePlaylist} style={{
                flex: 1, background: s.gold, color: '#070706', border: 'none',
                padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
                textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
              }}>
                Save playlist
              </button>
              <button onClick={analyseMix} style={{
                flex: 1, background: 'transparent', border: `1px solid ${s.gold}50`, color: s.gold,
                padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
                textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
              }}>
                Analyse mix
              </button>
            </div>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none', color: s.dimmer,
              padding: '10px', fontSize: '10px', letterSpacing: '0.1em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>

          {error && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', fontSize: '12px', color: '#c04040' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Saved */}
      {phase === 'saved' && (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: s.text, marginBottom: '12px' }}>Playlist saved</div>
          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '24px' }}>
            {tracks.length} tracks — available in Set Lab on desktop
          </div>
          <button onClick={reset} style={{
            background: s.panel, border: `1px solid ${s.border}`, color: s.dim,
            fontFamily: s.font, fontSize: '12px', letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer',
          }}>
            Add another
          </button>
        </div>
      )}

      {/* Analysing */}
      {phase === 'analysing' && (
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Analysing mix...
          </div>
        </div>
      )}

      {/* Analysis results */}
      {phase === 'analysed' && analysisResult && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '28px', textAlign: 'center', marginBottom: '14px' }}>
            <div style={{
              fontFamily: "'Unbounded', sans-serif", fontSize: '48px', fontWeight: 300,
              color: scoreColor(analysisResult.overall_score), marginBottom: '4px',
            }}>
              {analysisResult.overall_score?.toFixed(1)}
            </div>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>Out of 10</div>
            {analysisResult.headline && (
              <div style={{ fontSize: '14px', color: s.text, marginTop: '16px', lineHeight: 1.7, fontStyle: 'italic' }}>
                "{analysisResult.headline}"
              </div>
            )}
          </div>

          {analysisResult.strengths?.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '18px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: '#4ecb71', textTransform: 'uppercase', marginBottom: '12px' }}>What works</div>
              {analysisResult.strengths.map((str: string, i: number) => (
                <div key={i} style={{ fontSize: '13px', color: s.dim, lineHeight: 1.7, marginBottom: '8px', paddingLeft: '14px', borderLeft: '2px solid rgba(78,203,113,0.2)' }}>
                  {str}
                </div>
              ))}
            </div>
          )}

          {analysisResult.improvements?.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>Improvements</div>
              {analysisResult.improvements.map((imp: string, i: number) => (
                <div key={i} style={{ fontSize: '13px', color: s.dim, lineHeight: 1.7, marginBottom: '8px', paddingLeft: '14px', borderLeft: 'rgba(176,141,87,0.3)' }}>
                  {imp}
                </div>
              ))}
            </div>
          )}

          <button onClick={reset} style={{
            width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.dim,
            padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
            textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
          }}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}
