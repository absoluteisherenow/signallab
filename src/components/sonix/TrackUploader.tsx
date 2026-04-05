'use client'

import { useState } from 'react'

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
  const [trackName, setTrackName] = useState('')
  const [artist, setArtist] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null)
  const [error, setError] = useState('')

  const s = {
    bg: 'var(--bg)',
    border: 'var(--border-dim)',
    gold: 'var(--gold-bright)',
    goldDim: 'var(--gold-dim)',
    text: 'var(--text)',
    textDim: 'var(--text-dim)',
    textDimmer: 'var(--text-dimmer)',
    black: 'var(--bg-input)',
    font: "'DM Mono', monospace",
  }

  async function analyse() {
    if (!trackName) { setError('Enter a track name first'); return }
    setAnalysing(true)
    setError('')
    setAnalysis(null)
    try {
      const raw = await callClaude(
        'You are an expert music analyst. Return ONLY valid JSON, no markdown.',
        `Get the data for this track:
Track: ${artist ? artist + ' — ' : ''}${trackName}

Return JSON:
{
  "title": "${trackName}",
  "artist": "${artist || 'Unknown'}",
  "bpm": <number>,
  "key": "<key name e.g. A minor>",
  "camelot": "<camelot code e.g. 8A>",
  "energy": <number 1-10>,
  "genre": "<genre>",
  "mood": "<2-3 word mood>",
  "arrangement_notes": "<2 sentences on arrangement structure>",
  "mix_notes": "<2 sentences on mix characteristics>",
  "reference_artists": ["<artist1>", "<artist2>", "<artist3>"]
}`,
        400
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setAnalysis(d)
    } catch (err: any) {
      console.error('TrackUploader error:', err?.message || err)
      setError('Could not get track data — check the track name')
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
      <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ display: 'block', width: '20px', height: '1px', background: s.gold }} />
        Track lookup — BPM, key &amp; sonic profile
      </div>
      <div style={{ fontSize: '11px', color: s.textDimmer, marginBottom: '20px' }}>
        Type any track name to get its key, BPM and Camelot code — then send it straight to Set Lab.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Track name</div>
          <input value={trackName} onChange={e => setTrackName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyse() }}
            placeholder="Track title"
            style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Artist</div>
          <input value={artist} onChange={e => setArtist(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyse() }}
            placeholder="Artist name"
            style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
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
          cursor: analysing || !trackName ? 'default' : 'pointer',
          opacity: !trackName ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {analysing && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
          {analysing ? 'Looking up…' : 'Get track data →'}
        </button>
        {error && <div style={{ fontSize: '11px', color: 'var(--red-brown)' }}>{error}</div>}
      </div>

      {analysis && (
        <div style={{ background: s.black, border: `1px solid ${s.goldDim}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '16px', color: s.text, marginBottom: '4px' }}>{analysis.artist} — {analysis.title}</div>
              <div style={{ fontSize: '10px', color: s.textDimmer }}>{analysis.genre} · {analysis.mood}</div>
            </div>
            <button onClick={sendToSetLab} style={{
              background: 'linear-gradient(180deg, #2a3020 0%, #1a2010 100%)',
              border: '1px solid var(--accent-green)',
              color: 'var(--accent-green)',
              fontFamily: s.font,
              fontSize: '10px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: 'pointer',
            }}>
              Add to Set Lab →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {[
              { l: 'BPM', v: analysis.bpm },
              { l: 'Key', v: analysis.key },
              { l: 'Camelot', v: analysis.camelot },
              { l: 'Energy', v: `${analysis.energy}/10` },
            ].map(stat => (
              <div key={stat.l} style={{ background: s.bg, border: `1px solid ${s.border}`, padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>{stat.l}</div>
                <div style={{ fontSize: '14px', color: s.gold }}>{stat.v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Arrangement</div>
              <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{analysis.arrangement_notes}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Mix character</div>
              <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{analysis.mix_notes}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Sounds like</div>
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
