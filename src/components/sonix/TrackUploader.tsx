'use client'

import { useState, useRef } from 'react'

interface TrackAnalysis {
  title: string
  artist: string
  bpm: number
  key: string
  camelot: string
  energy: number
  genre: string
  mood: string
  arrangement_notes: string
  mix_notes: string
  reference_artists: string[]
  suggested_chain: string
}

async function callClaude(system: string, userPrompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export function TrackUploader() {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [trackName, setTrackName] = useState('')
  const [artist, setArtist] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const s = {
    bg: '#1a1410',
    panel: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
    border: '#3a2e1c',
    gold: '#c9a46e',
    goldDim: '#6a4e28',
    text: '#e8dcc8',
    textDim: '#8a7a5a',
    textDimmer: '#5a4428',
    black: '#0e0b06',
    font: "'DM Mono', monospace",
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) {
      setFile(f)
      const name = f.name.replace(/\.[^/.]+$/, '')
      if (!trackName) setTrackName(name)
    }
  }

  async function analyse() {
    if (!trackName) { setError('Enter a track name first'); return }
    setAnalysing(true)
    setError('')
    setAnalysis(null)
    try {
      const raw = await callClaude(
        'You are an expert music analyst and producer. Analyse tracks with precision. Return ONLY valid JSON, no markdown.',
        `Analyse this track for a producer:
Track: ${artist ? artist + ' — ' : ''}${trackName}
${file ? 'File uploaded: ' + file.name : ''}

Return JSON:
{
  "title": "${trackName}",
  "artist": "${artist || 'Unknown'}",
  "bpm": number,
  "key": "key name e.g. A minor",
  "camelot": "camelot code e.g. 8A",
  "energy": number 1-10,
  "genre": "genre",
  "mood": "2-3 word mood description",
  "arrangement_notes": "2 sentences on arrangement structure",
  "mix_notes": "2 sentences on mix characteristics",
  "reference_artists": ["artist1", "artist2", "artist3"],
  "suggested_chain": "which Sonix Lab mix chain to use"
}`,
        400
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setAnalysis(d)
    } catch (err: any) {
      setError('Analysis failed: ' + err.message)
    } finally {
      setAnalysing(false)
    }
  }

  function sendToSetLab() {
    if (!analysis) return
    const params = new URLSearchParams({
      title: analysis.title,
      artist: analysis.artist,
      bpm: analysis.bpm.toString(),
      key: analysis.key,
      camelot: analysis.camelot,
      energy: analysis.energy.toString(),
      genre: analysis.genre,
    })
    window.location.href = '/setlab?' + params.toString()
  }

  return (
    <div style={{ background: s.bg, fontFamily: s.font, color: s.text, padding: '28px', borderTop: `1px solid ${s.border}`, marginTop: '24px' }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ display: 'block', width: '20px', height: '1px', background: s.gold }} />
        Track analyser — upload for instant AI analysis
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Track name</div>
          <input value={trackName} onChange={e => setTrackName(e.target.value)}
            placeholder="Track title"
            style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Artist (optional)</div>
          <input value={artist} onChange={e => setArtist(e.target.value)}
            placeholder="Artist name"
            style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          background: dragging ? '#2a2010' : s.black,
          border: `1px dashed ${dragging ? s.gold : s.border}`,
          padding: '28px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
          marginBottom: '16px',
        }}>
        <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.aiff,.flac" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!trackName) setTrackName(f.name.replace(/\.[^/.]+$/, '')) } }}
          style={{ display: 'none' }} />
        {file ? (
          <div>
            <div style={{ fontSize: '13px', color: s.gold, marginBottom: '4px' }}>{file.name}</div>
            <div style={{ fontSize: '11px', color: s.textDimmer }}>{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '13px', color: s.textDim, marginBottom: '6px' }}>Drop audio file here or click to browse</div>
            <div style={{ fontSize: '10px', color: s.textDimmer }}>MP3, WAV, AIFF, FLAC — or just enter the track name above without a file</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={analyse} disabled={analysing || !trackName} style={{
          background: analysing ? s.black : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
          border: `1px solid ${s.goldDim}`,
          color: s.gold,
          fontFamily: s.font,
          fontSize: '10px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          padding: '12px 28px',
          cursor: 'pointer',
          opacity: (!trackName) ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {analysing && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
          {analysing ? 'Analysing...' : 'Analyse track'}
        </button>
        {error && <div style={{ fontSize: '11px', color: '#8a4a3a' }}>{error}</div>}
      </div>

      {/* ANALYSIS RESULT */}
      {analysis && (
        <div style={{ background: s.black, border: `1px solid ${s.goldDim}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '16px', color: s.text, marginBottom: '4px' }}>{analysis.artist} — {analysis.title}</div>
              <div style={{ fontSize: '10px', color: s.textDimmer }}>{analysis.genre} · {analysis.mood}</div>
            </div>
            <button onClick={sendToSetLab} style={{
              background: 'linear-gradient(180deg, #2a3020 0%, #1a2010 100%)',
              border: '1px solid #4a6a38',
              color: '#8aba68',
              fontFamily: s.font,
              fontSize: '9px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: 'pointer',
            }}>
              Send to SetLab →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {[
              { l: 'BPM', v: analysis.bpm },
              { l: 'Key', v: analysis.key },
              { l: 'Camelot', v: analysis.camelot },
              { l: 'Energy', v: `${analysis.energy}/10` },
              { l: 'Chain', v: analysis.suggested_chain.split('—')[0].trim() },
            ].map(stat => (
              <div key={stat.l} style={{ background: s.bg, border: `1px solid ${s.border}`, padding: '12px 14px' }}>
                <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>{stat.l}</div>
                <div style={{ fontSize: '14px', color: s.gold }}>{stat.v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Arrangement</div>
              <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{analysis.arrangement_notes}</div>
            </div>
            <div>
              <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Mix character</div>
              <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{analysis.mix_notes}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Sounds like</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {analysis.reference_artists.map(a => (
                <div key={a} style={{ background: s.bg, border: `1px solid ${s.border}`, padding: '6px 12px', fontSize: '11px', color: s.textDim }}>{a}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
