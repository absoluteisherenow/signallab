'use client'

import { useState, useRef } from 'react'

interface RekordboxTrack {
  id: string
  name: string
  artist: string
  bpm: number
  key: string
  camelot: string
  duration: string
  rating: number
  playCount: number
  genre: string
  filePath: string
}

const KEY_TO_CAMELOT: Record<string, string> = {
  'Am': '8A', 'Em': '9A', 'Bm': '10A', 'F#m': '11A', 'Dbm': '12A',
  'Abm': '1A', 'Ebm': '2A', 'Bbm': '3A', 'Fm': '4A', 'Cm': '5A',
  'Gm': '6A', 'Dm': '7A', 'C': '8B', 'G': '9B', 'D': '10B',
  'A': '11B', 'E': '12B', 'B': '1B', 'F#': '2B', 'Db': '3B',
  'Ab': '4B', 'Eb': '5B', 'Bb': '6B', 'F': '7B',
}

function parseRekordboxXML(xmlString: string): RekordboxTrack[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  const tracks = doc.querySelectorAll('TRACK[Name]')
  const result: RekordboxTrack[] = []

  tracks.forEach(track => {
    const name = track.getAttribute('Name') || ''
    const artist = track.getAttribute('Artist') || ''
    const bpm = parseFloat(track.getAttribute('AverageBpm') || track.getAttribute('BPM') || '0')
    const keyRaw = track.getAttribute('Tonality') || ''
    const camelot = KEY_TO_CAMELOT[keyRaw] || '?'
    const totalTime = parseInt(track.getAttribute('TotalTime') || '0')
    const minutes = Math.floor(totalTime / 60)
    const seconds = totalTime % 60
    const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`
    const rating = parseInt(track.getAttribute('Rating') || '0')
    const playCount = parseInt(track.getAttribute('PlayCount') || '0')
    const genre = track.getAttribute('Genre') || ''
    const filePath = track.getAttribute('Location') || ''

    if (name) {
      result.push({
        id: track.getAttribute('TrackID') || Date.now().toString() + Math.random(),
        name, artist, bpm, key: keyRaw, camelot, duration, rating, playCount, genre, filePath,
      })
    }
  })

  return result
}

export default function RekordboxImport() {
  const [tracks, setTracks] = useState<RekordboxTrack[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 })
  const [imported, setImported] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [needsAudio, setNeedsAudio] = useState<{ artist: string; title: string }[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [importMode, setImportMode] = useState<'xml' | 'screenshot'>('screenshot')
  const [screenshotDragging, setScreenshotDragging] = useState(false)
  const [screenshotParsing, setScreenshotParsing] = useState(false)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [detectedSource, setDetectedSource] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  async function parseScreenshot(file: File) {
    setScreenshotParsing(true)
    setError('')
    setDetectedSource('')

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setScreenshotPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type || 'image/jpeg'

      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: 'You are a music library assistant. Extract tracklists from screenshots of any music platform. Return ONLY plain text in the exact format specified — no JSON, no markdown, no explanation.',
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64 },
                },
                {
                  type: 'text',
                  text: `Extract every track visible in this screenshot.

First line: SOURCE: <platform name e.g. Rekordbox, Spotify, Apple Music, Beatport, Unknown>
Second line: PLAYLIST: <playlist name if visible, or NONE>
Then one track per line in this exact format:
ARTIST | TITLE | BPM | KEY | DURATION

Rules:
- Use | as separator
- If BPM, KEY, or DURATION is not visible, write -
- Include every track you can see, even partial ones
- No blank lines between tracks
- No header row for the tracks

Example:
SOURCE: Rekordbox
PLAYLIST: Friday Set
Fred again.. | Danielle (In the Morning) | 128 | 1A | 4:23
Four Tet | Teenage Birdsong | 130 | - | 5:12`,
                },
              ],
            }],
          }),
        })

        const data = await res.json()
        if (data.error) throw new Error(data.error)
        const raw = data.content?.[0]?.text
        if (!raw) throw new Error('No response from vision model')

        const lines = raw.trim().split('\n').map((l: string) => l.trim()).filter(Boolean)

        // Extract source and playlist from header lines
        let source = 'Unknown'
        const trackLines: string[] = []
        for (const line of lines) {
          if (line.startsWith('SOURCE:')) source = line.replace('SOURCE:', '').trim()
          else if (line.startsWith('PLAYLIST:')) { /* captured but not needed here */ }
          else if (line.includes('|')) trackLines.push(line)
        }
        setDetectedSource(source)

        const extractedTracks: RekordboxTrack[] = trackLines.map((line, i) => {
          const parts = line.split('|').map(p => p.trim())
          const artist = parts[0] || ''
          const name = parts[1] || ''
          const bpmRaw = parts[2] || '-'
          const keyRaw = parts[3] || '-'
          const duration = parts[4] !== '-' ? parts[4] || '' : ''
          const bpm = bpmRaw !== '-' ? parseFloat(bpmRaw) || 0 : 0
          const key = keyRaw !== '-' ? keyRaw : ''
          return {
            id: `screenshot-${Date.now()}-${i}`,
            name, artist, bpm, key,
            camelot: KEY_TO_CAMELOT[key] || '?',
            duration, rating: 0, playCount: 0, genre: '', filePath: '',
          }
        }).filter(t => t.name && t.artist)

        if (extractedTracks.length === 0) {
          setError('No tracks detected. Try a clearer screenshot with track names visible.')
        } else {
          setTracks(extractedTracks)
          setSelected(new Set(extractedTracks.map(t => t.id)))
        }
      } catch (err: any) {
        setError('Screenshot parse failed: ' + err.message)
      } finally {
        setScreenshotParsing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  function handleScreenshotDrop(e: React.DragEvent) {
    e.preventDefault()
    setScreenshotDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) parseScreenshot(file)
    else setError('Please drop an image file')
  }

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917', borderBright: '#2e2c29',
    gold: '#b08d57', goldDim: '#6a4e28', text: '#f0ebe2', dim: '#8a8780',
    dimmer: '#52504c', black: '#070706', setlab: '#9a6a5a',
    font: "'DM Mono', monospace",
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const xml = ev.target?.result as string
        const parsed = parseRekordboxXML(xml)
        if (parsed.length === 0) {
          setError('No tracks found. Make sure this is a rekordbox XML export.')
          return
        }
        setTracks(parsed)
        setSelected(new Set(parsed.map(t => t.id)))
      } catch {
        setError('Could not parse XML. Export from rekordbox: File → Export Collection in xml format.')
      }
    }
    reader.readAsText(file)
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(t => t.id)))
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Import: save to database, then batch enrich with Claude ────────────
  async function importSelected() {
    const selectedTracks = tracks.filter(t => selected.has(t.id))
    if (selectedTracks.length === 0) return

    setImporting(true)
    setError('')

    try {
      // Step 1: Save raw tracks to Supabase via API
      const rawTracks = selectedTracks.map(t => ({
        title: t.name,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        camelot: t.camelot,
        duration: t.duration,
        genre: t.genre,
        play_count: t.playCount,
        rating: t.rating,
        source: 'rekordbox',
        enriched: false,
      }))

      const saveRes = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: rawTracks }),
      })
      const saveData = await saveRes.json()
      if (saveData.error) throw new Error(saveData.error)

      setImportedCount(selectedTracks.length)
      setImporting(false)

      // Step 2: Batch enrich with Claude (5 tracks at a time)
      setEnriching(true)
      const batchSize = 5
      const total = selectedTracks.length
      setEnrichProgress({ done: 0, total })

      for (let i = 0; i < total; i += batchSize) {
        const batch = selectedTracks.slice(i, i + batchSize)
        const trackList = batch.map((t, j) => `${j + 1}. ${t.artist} — ${t.name} (${t.bpm}BPM, ${t.key})`).join('\n')

        try {
          const res = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system: 'You are a DJ music intelligence expert. Return ONLY a valid JSON array, no markdown.',
              max_tokens: 1200,
              messages: [{ role: 'user', content: `Analyse these ${batch.length} tracks for a DJ library.

IMPORTANT: Only fill in analysis fields if you genuinely know this track. If you do not recognise it — unreleased music, white labels, obscure edits — set "known": false and leave energy/mix_in/mix_out/crowd_reaction/notes as null. Never guess.

For each track return:
{
  "title": "track title",
  "artist": "artist name",
  "known": true or false,
  "energy": number 1-10 or null if unknown,
  "moment_type": "opener|builder|peak|breakdown|closer" or null,
  "position_score": "warm-up|build|peak|cool-down" or null,
  "mix_in": "specific DJ mix-in technique" or null,
  "mix_out": "specific mix-out technique" or null,
  "crowd_reaction": "expected crowd response in 5-8 words" or null,
  "producer_style": "one sentence about production style" or null,
  "notes": "when/how to use this in a set" or null
}

Tracks:
${trackList}

Return as JSON array: [{...}, {...}, ...]` }],
            }),
          })
          const data = await res.json()
          const raw = data.content?.[0]?.text || '[]'
          const enriched = JSON.parse(raw.replace(/```json|```/g, '').trim())

          // Save enriched data back, flag unknown tracks for audio upload
          if (Array.isArray(enriched) && enriched.length > 0) {
            const unknown = enriched.filter((e: any) => e.known === false)
            if (unknown.length > 0) {
              setNeedsAudio(prev => [...prev, ...unknown.map((e: any) => ({ artist: e.artist, title: e.title }))])
            }
            const enrichedTracks = enriched.map((e: any) => ({
              ...e,
              bpm: batch.find(b => b.name === e.title)?.bpm || 0,
              key: batch.find(b => b.name === e.title)?.key || '',
              camelot: batch.find(b => b.name === e.title)?.camelot || '',
              duration: batch.find(b => b.name === e.title)?.duration || '',
              genre: batch.find(b => b.name === e.title)?.genre || '',
              source: 'rekordbox',
              enriched: e.known !== false,
              needs_audio: e.known === false,
            }))
            await fetch('/api/tracks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tracks: enrichedTracks }),
            })
          }
        } catch {
          // Continue on enrichment failure — raw data is already saved
        }

        setEnrichProgress({ done: Math.min(i + batchSize, total), total })
      }

      setEnriching(false)
      setImported(true)
    } catch (err: any) {
      setError('Import failed: ' + err.message)
      setImporting(false)
      setEnriching(false)
    }
  }

  const filtered = tracks.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.artist.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px 40px' }}>

      <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.setlab, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span style={{ display: 'block', width: '28px', height: '1px', background: s.setlab }} />
        Set Lab — Rekordbox Import
      </div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '24px', fontWeight: 300, letterSpacing: '0.06em', marginBottom: '8px' }}>Import library</div>
      <div style={{ fontSize: '13px', color: s.dim, marginBottom: '24px', lineHeight: '1.7' }}>
        Screenshot any playlist — Spotify, Apple Music, Beatport, Tidal, a paper setlist. Claude reads it and pulls the tracks out.
      </div>

      {/* Mode switcher */}
      {tracks.length === 0 && (
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', border: `1px solid ${s.border}`, width: 'fit-content' }}>
          {(['screenshot', 'xml'] as const).map(mode => (
            <button key={mode} onClick={() => { setImportMode(mode); setError('') }} style={{
              background: importMode === mode ? s.setlab + '20' : 'transparent',
              border: 'none',
              borderRight: mode === 'screenshot' ? `1px solid ${s.border}` : 'none',
              color: importMode === mode ? s.setlab : s.dimmer,
              fontFamily: s.font,
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '10px 20px',
              cursor: 'pointer',
            }}>
              {mode === 'screenshot' ? '📸  Screenshot' : 'XML Export'}
            </button>
          ))}
        </div>
      )}

      {tracks.length === 0 ? (
        <div>
          {importMode === 'screenshot' ? (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setScreenshotDragging(true) }}
                onDragLeave={() => setScreenshotDragging(false)}
                onDrop={handleScreenshotDrop}
                onClick={() => !screenshotParsing && screenshotInputRef.current?.click()}
                style={{
                  border: `1px dashed ${screenshotDragging ? s.setlab : s.border}`,
                  padding: screenshotPreview ? '0' : '60px',
                  textAlign: 'center',
                  cursor: screenshotParsing ? 'wait' : 'pointer',
                  background: s.panel,
                  marginBottom: '16px',
                  transition: 'all 0.15s',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <input ref={screenshotInputRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) parseScreenshot(f) }} style={{ display: 'none' }} />
                {screenshotPreview ? (
                  <div style={{ position: 'relative' }}>
                    <img src={screenshotPreview} alt="Playlist screenshot" style={{ width: '100%', display: 'block', opacity: screenshotParsing ? 0.4 : 1 }} />
                    {screenshotParsing && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>Reading playlist...</div>
                        <div style={{ height: '1px', width: '120px', background: s.border, position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: '-40%', width: '40%', height: '1px', background: s.setlab, animation: 'scan 1.2s ease-in-out infinite' }} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : screenshotParsing ? (
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>Reading playlist...</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '32px', color: s.dimmer, marginBottom: '12px' }}>📸</div>
                    <div style={{ fontSize: '14px', color: s.dim, marginBottom: '8px' }}>Drop a playlist screenshot here</div>
                    <div style={{ fontSize: '11px', color: s.dimmer }}>Spotify · Apple Music · Beatport · Tidal · SoundCloud · anything</div>
                  </div>
                )}
              </div>

              {detectedSource && !screenshotParsing && (
                <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.12em', marginBottom: '12px' }}>
                  Detected source: <span style={{ color: s.setlab }}>{detectedSource}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `1px dashed ${s.border}`, padding: '60px', textAlign: 'center', cursor: 'pointer', background: s.panel, marginBottom: '24px', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = s.setlab}
                onMouseLeave={e => e.currentTarget.style.borderColor = s.border}
              >
                <input ref={fileInputRef} type="file" accept=".xml" onChange={handleFile} style={{ display: 'none' }} />
                <div style={{ fontSize: '14px', color: s.dim, marginBottom: '8px' }}>Drop rekordbox XML here or click to browse</div>
                <div style={{ fontSize: '11px', color: s.dimmer }}>Accepts .xml files exported from rekordbox</div>
              </div>

              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>How to export from rekordbox</div>
                {[
                  '01 — Open rekordbox on your Mac or PC',
                  '02 — Go to File → Export Collection in xml format',
                  '03 — Save the .xml file anywhere',
                  '04 — Upload it here — BPM, key, Camelot mapped automatically',
                  '05 — Claude enriches each track: energy, mix techniques, crowd reaction',
                  '06 — Build your set in Set Lab, then export back as rekordbox crate',
                ].map(step => (
                  <div key={step} style={{ fontSize: '12px', color: s.dim, padding: '8px 0', borderBottom: `1px solid ${s.border}`, letterSpacing: '0.04em' }}>{step}</div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ fontSize: '12px', color: '#9a6a5a', padding: '14px 18px', border: '1px solid #4a2a1a', background: 'rgba(154,106,90,0.08)', marginBottom: '16px', marginTop: '8px' }}>{error}</div>}
        </div>
      ) : imported ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: s.panel, border: `1px solid ${s.setlab}40`, padding: '40px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, color: s.setlab, marginBottom: '12px' }}>
              {importedCount} tracks imported
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '8px' }}>
              {importedCount - needsAudio.length} enriched · {needsAudio.length > 0 ? `${needsAudio.length} need audio analysis` : 'all analysed'}
            </div>
            <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '28px' }}>
              Available in your Set Lab Library — start building sets
            </div>
            <a href="/setlab" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.setlab, textDecoration: 'none', border: `1px solid ${s.setlab}60`, padding: '14px 28px' }}>
              Open Set Lab →
            </a>
          </div>

          {needsAudio.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '28px 32px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '6px' }}>Audio needed for full analysis</div>
              <div style={{ fontSize: '12px', color: s.dim, marginBottom: '20px', lineHeight: '1.7' }}>
                These tracks aren't in our knowledge base — unreleased music, white labels, or personal edits. Drop the audio files below and we'll analyse energy, dynamics, and mix points directly from the waveform.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                {needsAudio.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: s.dimmer, padding: '8px 0', borderBottom: `1px solid ${s.border}` }}>
                    <span style={{ color: s.gold, fontSize: '8px' }}>◆</span>
                    <span style={{ color: s.dim }}>{t.artist}</span>
                    <span style={{ color: s.dimmer }}>—</span>
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
              <div style={{ border: `1px dashed ${s.border}`, padding: '32px', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => {}}>
                <div style={{ fontSize: '12px', color: s.dim, marginBottom: '6px' }}>Drop audio files here</div>
                <div style={{ fontSize: '10px', color: s.dimmer }}>MP3, WAV, AIFF, FLAC — waveform analysis, no track knowledge needed</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Progress bar during enrichment */}
          {(importing || enriching) && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>
                  {importing ? 'Saving tracks...' : `Enriching with Claude — ${enrichProgress.done}/${enrichProgress.total}`}
                </div>
                <div style={{ fontSize: '10px', color: s.dim }}>
                  {enriching ? `${Math.round((enrichProgress.done / enrichProgress.total) * 100)}%` : ''}
                </div>
              </div>
              <div style={{ height: '4px', background: s.border, position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '4px',
                  width: enriching ? `${(enrichProgress.done / enrichProgress.total) * 100}%` : '100%',
                  background: s.setlab, transition: 'width 0.5s ease',
                }} />
              </div>
              {enriching && (
                <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '8px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                  Analysing energy, mix techniques, crowd reaction for each track...
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: s.dim }}>
              {tracks.length} tracks found · <span style={{ color: s.setlab }}>{selected.size} selected</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracks..."
                style={{ background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 14px', outline: 'none', width: '200px' }} />
              <button onClick={toggleAll} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={importSelected} disabled={selected.size === 0 || importing || enriching} style={{
                background: selected.size > 0 && !importing && !enriching ? s.setlab : 'transparent',
                border: `1px solid ${s.setlab}`,
                color: selected.size > 0 && !importing && !enriching ? s.bg : s.setlab,
                fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
                padding: '8px 20px', cursor: 'pointer',
                opacity: selected.size === 0 || importing || enriching ? 0.4 : 1,
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                {(importing || enriching) && <div style={{ width: '10px', height: '10px', border: '1px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {importing ? 'Saving...' : enriching ? 'Enriching...' : `Import ${selected.size} tracks →`}
              </button>
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: '#9a6a5a', padding: '14px 18px', border: '1px solid #4a2a1a', background: 'rgba(154,106,90,0.08)', marginBottom: '16px' }}>{error}</div>}

          {/* Track table */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.2fr 60px 60px 70px 70px 60px', padding: '10px 16px', borderBottom: `1px solid ${s.border}` }}>
              {['', 'Track', 'Artist', 'BPM', 'Key', 'Camelot', 'Time', 'Plays'].map(h => (
                <div key={h} style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {filtered.map((track, i) => (
                <div key={track.id} onClick={() => toggle(track.id)} style={{
                  display: 'grid', gridTemplateColumns: '40px 2fr 1.2fr 60px 60px 70px 70px 60px',
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${s.border}` : 'none',
                  cursor: 'pointer',
                  background: selected.has(track.id) ? 'rgba(154,106,90,0.08)' : 'transparent',
                  transition: 'background 0.1s',
                  alignItems: 'center',
                }}>
                  <div style={{ width: '14px', height: '14px', border: `1px solid ${selected.has(track.id) ? s.setlab : s.border}`, background: selected.has(track.id) ? s.setlab + '30' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected.has(track.id) && <div style={{ width: '6px', height: '6px', background: s.setlab }} />}
                  </div>
                  <div style={{ fontSize: '13px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</div>
                  <div style={{ fontSize: '12px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist}</div>
                  <div style={{ fontSize: '12px', color: s.gold }}>{track.bpm > 0 ? track.bpm.toFixed(0) : '—'}</div>
                  <div style={{ fontSize: '11px', color: s.dim }}>{track.key || '—'}</div>
                  <div style={{ fontSize: '11px', color: s.setlab, letterSpacing: '0.08em' }}>{track.camelot !== '?' ? track.camelot : '—'}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{track.duration}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{track.playCount > 0 ? track.playCount : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes scan { 0% { left: -40%; } 100% { left: 140%; } }`}</style>
    </div>
  )
}
