'use client'

import { useState, useRef, useEffect } from 'react'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

interface Track {
  artist: string
  title: string
}

interface IdentifiedTrack {
  artist: string
  title: string
  album?: string
  label?: string
  confidence: number
  source: string
}

interface Reminder {
  artist: string
  title: string
  label?: string
  note: string
}

type Phase = 'choose' | 'parsing' | 'review' | 'saved' | 'analysing' | 'analysed'
  | 'listening' | 'identifying' | 'identified' | 'not_found' | 'id_added'
  | 'reminder_parsing' | 'reminder_review' | 'reminder_saved'

export default function MobileScan() {
  const [phase, setPhase] = useState<Phase>('choose')
  const [tracks, setTracks] = useState<Track[]>([])
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [identified, setIdentified] = useState<IdentifiedTrack | null>(null)
  const [listenCountdown, setListenCountdown] = useState(10)
  const [reminder, setReminder] = useState<Reminder | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const reminderRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
    }
  }, [])

  async function startListening() {
    setError('')
    setListenCountdown(10)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []

      // Pick a format the browser supports
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
        m => MediaRecorder.isTypeSupported(m)
      ) || ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (countdownRef.current) clearInterval(countdownRef.current)
        setPhase('identifying')

        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          const form = new FormData()
          form.append('audio', blob, 'snippet.webm')

          const res = await fetch('/api/fingerprint', { method: 'POST', body: form })
          const data = await res.json()

          if (data.found) {
            setIdentified({
              artist: data.artist || '',
              title: data.title || '',
              album: data.album,
              label: data.label,
              confidence: data.confidence,
              source: data.source,
            })
            setPhase('identified')
          } else {
            setPhase('not_found')
          }
        } catch {
          setError('Could not identify — check your connection')
          setPhase('choose')
        }
      }

      setPhase('listening')
      recorder.start(500) // collect data every 500ms

      // Countdown
      let secs = 10
      countdownRef.current = setInterval(() => {
        secs -= 1
        setListenCountdown(secs)
        if (secs <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
        }
      }, 1000)

    } catch {
      setError('Microphone access needed to identify tracks')
      setPhase('choose')
    }
  }

  function cancelListening() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    setPhase('choose')
  }

  function addIdentifiedToPlaylist() {
    if (!identified) return
    const playlists = JSON.parse(localStorage.getItem('signallab_playlists') || '[]')
    // Add to a "Discoveries" playlist, or create it
    const discIdx = playlists.findIndex((p: any) => p.name === 'Discoveries')
    const track = { artist: identified.artist, title: identified.title }
    if (discIdx >= 0) {
      playlists[discIdx].tracks.unshift(track)
    } else {
      playlists.unshift({
        id: Date.now().toString(),
        name: 'Discoveries',
        tracks: [track],
        created_at: new Date().toISOString(),
      })
    }
    localStorage.setItem('signallab_playlists', JSON.stringify(playlists))
    setPhase('id_added')
  }

  async function handleSmartSnap(file: File) {
    setPhase('reminder_parsing')
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
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: `Look at this image and extract music track information.

If you can see MULTIPLE tracks (e.g. CDJ screen with a tracklist, Rekordbox/Traktor library, playlist view, setlist), return:
{"type":"tracklist","tracks":[{"artist":"...","title":"..."},...]}

If you can see a SINGLE track (e.g. vinyl sleeve, record label, single track on a screen, a disc sleeve), return:
{"type":"single","artist":"...","title":"...","label":""}

Return ONLY the JSON, no other text.` },
            ],
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not read image')
      const parsed = JSON.parse(jsonMatch[0])

      if (parsed.type === 'tracklist' && parsed.tracks?.length > 0) {
        setTracks(parsed.tracks)
        setPhase('review')
      } else if (parsed.type === 'single' && (parsed.artist || parsed.title)) {
        setReminder({ artist: parsed.artist || '', title: parsed.title || '', label: parsed.label || '', note: '' })
        setPhase('reminder_review')
      } else {
        throw new Error('Nothing readable in that shot')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read — try a clearer shot')
      setPhase('choose')
    }
  }

  async function handleReminderSnap(file: File) {
    setPhase('reminder_parsing')
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
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: 'Identify the track in this image. This could be a record sleeve, vinyl label, CDJ screen, laptop, phone screen, or any music-related image. Extract the most prominent single track — the artist name, track/song title, and record label if visible. Return ONLY a JSON object with fields: "artist", "title", "label" (empty string if not visible). No other text.' },
            ],
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not read track')
      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.artist && !parsed.title) throw new Error('No track found')
      setReminder({ artist: parsed.artist || '', title: parsed.title || '', label: parsed.label || '', note: '' })
      setPhase('reminder_review')
    } catch {
      setError('Could not read the track — try a clearer shot')
      setPhase('choose')
    }
  }

  function saveReminder() {
    if (!reminder) return
    const playlists = JSON.parse(localStorage.getItem('signallab_playlists') || '[]')
    const discIdx = playlists.findIndex((p: any) => p.name === 'Discoveries')
    const track = {
      artist: reminder.artist,
      title: reminder.title,
      ...(reminder.note.trim() ? { note: reminder.note.trim() } : {}),
    }
    if (discIdx >= 0) {
      playlists[discIdx].tracks.unshift(track)
    } else {
      playlists.unshift({
        id: Date.now().toString(),
        name: 'Discoveries',
        tracks: [track],
        created_at: new Date().toISOString(),
      })
    }
    localStorage.setItem('signallab_playlists', JSON.stringify(playlists))
    setPhase('reminder_saved')
  }

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
    setIdentified(null)
    setReminder(null)
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

            {/* Identify a track — Shazam style */}
            <button
              onClick={startListening}
              style={{
                background: s.panel, border: `2px solid ${s.gold}40`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, flexShrink: 0 }}>◎</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Identify a track</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Listen for 10 seconds, add to your crate</div>
              </div>
            </button>

            {/* Track ID / Capture Reminder — smart photo capture, routes by content */}
            <button
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'
                inp.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0]
                  if (f) handleSmartSnap(f)
                }
                inp.click()
              }}
              style={{
                background: s.panel, border: `2px solid ${s.gold}30`,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '16px',
              }}
            >
              <div style={{ fontSize: '24px', color: s.gold, opacity: 0.8, flexShrink: 0 }}>◉</div>
              <div>
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Track ID / Capture Reminder</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>Snap your CDJs, vinyl sleeve or screen</div>
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
                <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Playlist screen grab</div>
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

      {/* Listening — countdown ring */}
      {phase === 'listening' && (
        <div style={{ padding: '60px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
          {/* Pulsing ring */}
          <div style={{ position: 'relative', width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid ${s.gold}`,
              animation: 'pulse-ring 1.4s ease-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: '12px', borderRadius: '50%',
              border: `1px solid ${s.gold}50`,
              animation: 'pulse-ring 1.4s ease-out infinite 0.4s',
            }} />
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: `${s.gold}15`, border: `1px solid ${s.gold}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column',
            }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 300, color: s.gold, lineHeight: 1 }}>
                {listenCountdown}
              </div>
            </div>
          </div>

          <style>{`
            @keyframes pulse-ring {
              0% { transform: scale(1); opacity: 0.8; }
              100% { transform: scale(1.3); opacity: 0; }
            }
          `}</style>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: s.text, marginBottom: '8px' }}>Listening...</div>
            <div style={{ fontSize: '11px', color: s.dimmer }}>Hold your phone near the speaker</div>
          </div>

          <button onClick={cancelListening} style={{
            background: 'transparent', border: `1px solid ${s.border}`,
            color: s.dimmer, fontFamily: s.font, fontSize: '11px',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '12px 24px', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      )}

      {/* Identifying */}
      {phase === 'identifying' && (
        <div style={{ padding: '80px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Matching...
          </div>
        </div>
      )}

      {/* Identified */}
      {phase === 'identified' && identified && (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '32px 24px', marginBottom: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>Found it</div>
            <div style={{ fontSize: '22px', color: s.text, marginBottom: '8px', lineHeight: 1.3 }}>{identified.title}</div>
            <div style={{ fontSize: '14px', color: s.dim, marginBottom: '20px' }}>{identified.artist}</div>
            {identified.label && (
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.08em' }}>{identified.label}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={addIdentifiedToPlaylist} style={{
              background: s.gold, color: '#070706', border: 'none',
              padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Add to Discoveries →
            </button>
            <button onClick={startListening} style={{
              background: 'transparent', border: `1px solid ${s.border}`,
              color: s.dim, padding: '14px', fontSize: '12px', letterSpacing: '0.14em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Identify another
            </button>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none',
              color: s.dimmer, padding: '10px', fontSize: '10px', letterSpacing: '0.1em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Added to playlist */}
      {phase === 'id_added' && identified && (
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: s.text, marginBottom: '8px' }}>Added to Discoveries</div>
          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '6px' }}>
            {identified.artist} — {identified.title}
          </div>
          <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '32px' }}>
            Available in Set Lab
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <button onClick={startListening} style={{
              background: s.panel, border: `1px solid ${s.border}`, color: s.dim,
              fontFamily: s.font, fontSize: '12px', letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer',
            }}>
              Identify another
            </button>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none',
              color: s.dimmer, padding: '10px', fontSize: '10px', letterSpacing: '0.1em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Not found */}
      {phase === 'not_found' && (
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: s.dim, marginBottom: '8px' }}>No match</div>
          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '32px' }}>Try closer to the speaker or in a quieter spot</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <button onClick={startListening} style={{
              background: s.gold, color: '#070706', border: 'none',
              padding: '14px 28px', fontSize: '12px', letterSpacing: '0.14em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Try again
            </button>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none',
              color: s.dimmer, padding: '10px', fontSize: '10px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: s.font, cursor: 'pointer',
            }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Reminder parsing */}
      {phase === 'reminder_parsing' && (
        <div style={{ padding: '80px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Reading track...
          </div>
        </div>
      )}

      {/* Reminder review — confirm and add a note */}
      {phase === 'reminder_review' && reminder && (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Track found</div>
            <div style={{ fontSize: '18px', color: s.text, marginBottom: '6px', lineHeight: 1.3 }}>
              <input
                value={reminder.title}
                onChange={e => setReminder(r => r ? { ...r, title: e.target.value } : r)}
                placeholder="Title"
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${s.border}`, color: s.text,
                  fontFamily: s.font, fontSize: '17px', padding: '6px 0',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <input
              value={reminder.artist}
              onChange={e => setReminder(r => r ? { ...r, artist: e.target.value } : r)}
              placeholder="Artist"
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: `1px solid ${s.border}`, color: s.dim,
                fontFamily: s.font, fontSize: '14px', padding: '6px 0',
                outline: 'none', boxSizing: 'border-box', marginBottom: '16px',
              }}
            />
            {reminder.label && (
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.08em', marginBottom: '16px' }}>{reminder.label}</div>
            )}
            <input
              ref={reminderRef}
              value={reminder.note}
              onChange={e => setReminder(r => r ? { ...r, note: e.target.value } : r)}
              placeholder="Add a note — where you heard it, why you flagged it..."
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: `1px solid ${s.border}50`, color: s.dimmer,
                fontFamily: s.font, fontSize: '12px', padding: '8px 0',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={saveReminder} style={{
              background: s.gold, color: '#070706', border: 'none',
              padding: '16px', fontSize: '12px', letterSpacing: '0.14em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer',
            }}>
              Save to Discoveries →
            </button>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none',
              color: s.dimmer, padding: '10px', fontSize: '10px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: s.font, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reminder saved */}
      {phase === 'reminder_saved' && reminder && (
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: s.text, marginBottom: '8px' }}>Saved to Discoveries</div>
          <div style={{ fontSize: '13px', color: s.dim, marginBottom: '4px' }}>{reminder.title}</div>
          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '32px' }}>{reminder.artist}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => {
                setReminder(null)
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'
                inp.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0]
                  if (f) handleReminderSnap(f)
                }
                inp.click()
              }}
              style={{
                background: s.panel, border: `1px solid ${s.border}`, color: s.dim,
                fontFamily: s.font, fontSize: '12px', letterSpacing: '0.12em',
                textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer',
              }}
            >
              Snap another
            </button>
            <button onClick={reset} style={{
              background: 'transparent', border: 'none',
              color: s.dimmer, padding: '10px', fontSize: '10px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: s.font, cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
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
