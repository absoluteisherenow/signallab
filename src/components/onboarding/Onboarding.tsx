'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Track {
  title: string
  artist: string
  bpm: string
  key: string
}

const STEPS = ['welcome', 'add_tracks', 'analysing', 'result', 'done']

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: 'You are an expert DJ analyst. Be concise, specific, and musical. No markdown.',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export default function Onboarding() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [tracks, setTracks] = useState<Track[]>([
    { title: '', artist: '', bpm: '', key: '' },
    { title: '', artist: '', bpm: '', key: '' },
    { title: '', artist: '', bpm: '', key: '' },
  ])
  const [analysis, setAnalysis] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [artistName, setArtistName] = useState('')

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  async function analyseSet() {
    const filled = tracks.filter(t => t.title || t.artist)
    if (filled.length < 2) return
    setAnalysing(true)
    setStep(2)

    const trackList = filled.map((t, i) =>
      `${i + 1}. ${t.artist ? t.artist + ' — ' : ''}${t.title}${t.bpm ? ` (${t.bpm} BPM` : ''}${t.key ? `, ${t.key})` : t.bpm ? ')' : ''}`
    ).join('\n')

    const result = await callClaude(
      `Analyse this DJ set opener for ${artistName || 'an electronic music artist'}:\n\n${trackList}\n\nGive a 3-sentence analysis covering: harmonic flow, energy arc, and one specific transition to watch. Be direct and specific.`
    )
    setAnalysis(result)
    setAnalysing(false)
    setStep(3)
  }

  function updateTrack(index: number, field: keyof Track, value: string) {
    setTracks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t))
  }

  const filledTracks = tracks.filter(t => t.title || t.artist).length

  return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font, padding: '40px' }}>
      <div style={{ maxWidth: '580px', width: '100%' }}>

        {/* STEP 0 — WELCOME */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.4em', color: s.gold, textTransform: 'uppercase', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
              The Modular Suite
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 200, letterSpacing: '0.03em', lineHeight: 1.1, marginBottom: '24px' }}>
              Let's see what<br />
              <span style={{ color: s.gold, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>you're playing.</span>
            </div>
            <p style={{ fontSize: '14px', color: s.dim, lineHeight: '1.9', marginBottom: '40px', letterSpacing: '0.04em' }}>
              Add three tracks from your next show. Set Lab will analyse your harmonic flow, energy arc, and flag any transitions to watch — in under 90 seconds.
            </p>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '10px' }}>Your name or act</div>
              <input value={artistName} onChange={e => setArtistName(e.target.value)}
                placeholder="Night Manoeuvres"
                style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '14px', padding: '14px 20px', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '16px' }} />
            </div>
            <button onClick={() => setStep(1)} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '18px 48px', cursor: 'pointer', width: '100%' }}>
              Get started →
            </button>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '16px', letterSpacing: '0.08em' }}>Takes about 90 seconds</div>
          </div>
        )}

        {/* STEP 1 — ADD TRACKS */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              Step 1 of 2 — Your tracks
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '24px', fontWeight: 200, letterSpacing: '0.05em', marginBottom: '8px' }}>
              What are you playing?
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              Add 2–3 tracks from your next show. BPM and key are optional — Set Lab can figure them out.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
              {tracks.map((track, i) => (
                <div key={i} style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>
                    Track {i + 1} {i === 0 ? '— opener' : i === 1 ? '— second' : '— third'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <input value={track.title} onChange={e => updateTrack(i, 'title', e.target.value)}
                      placeholder="Track title"
                      style={{ background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                    <input value={track.artist} onChange={e => updateTrack(i, 'artist', e.target.value)}
                      placeholder="Artist"
                      style={{ background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input value={track.bpm} onChange={e => updateTrack(i, 'bpm', e.target.value)}
                      placeholder="BPM (optional)"
                      style={{ background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                    <input value={track.key} onChange={e => updateTrack(i, 'key', e.target.value)}
                      placeholder="Key (optional)"
                      style={{ background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={analyseSet} disabled={filledTracks < 2} style={{
              background: filledTracks >= 2 ? s.gold : 'transparent',
              color: filledTracks >= 2 ? '#070706' : s.dimmer,
              border: `1px solid ${filledTracks >= 2 ? s.gold : s.border}`,
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
              textTransform: 'uppercase', padding: '18px', cursor: filledTracks >= 2 ? 'pointer' : 'default',
              width: '100%', transition: 'all 0.2s',
            }}>
              {filledTracks < 2 ? `Add ${2 - filledTracks} more track${2 - filledTracks > 1 ? 's' : ''} to continue` : 'Analyse my set →'}
            </button>
          </div>
        )}

        {/* STEP 2 — ANALYSING */}
        {step === 2 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '32px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '8px', height: '8px', borderRadius: '50%', background: s.gold,
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '20px', fontWeight: 200, color: s.gold, marginBottom: '12px' }}>
                Analysing your set...
              </div>
              <div style={{ fontSize: '13px', color: s.dim, lineHeight: '1.7' }}>
                Checking harmonic compatibility, energy arc, and transition points
              </div>
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
          </div>
        )}

        {/* STEP 3 — RESULT */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              Set analysis — {artistName || 'your set'}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '24px' }}>
              Here's what we found.
            </div>

            <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '28px 32px', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', color: s.dim, lineHeight: '1.9', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                {analysis}
              </div>
            </div>

            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Your tracks</div>
              {tracks.filter(t => t.title || t.artist).map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${s.border}`, fontSize: '13px' }}>
                  <span style={{ color: s.text }}>{t.artist ? `${t.artist} — ` : ''}{t.title}</span>
                  <span style={{ color: s.dimmer }}>{t.bpm ? `${t.bpm} BPM` : ''}{t.key ? ` · ${t.key}` : ''}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => router.push('/setlab')} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '16px', cursor: 'pointer' }}>
                Open Set Lab →
              </button>
              <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', color: s.dim, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '16px', cursor: 'pointer' }}>
                Go to dashboard
              </button>
            </div>
          </div>
        )}

        {/* PROGRESS DOTS */}
        {step < 3 && step > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
            {[1, 2].map(i => (
              <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: step >= i ? s.gold : s.border, transition: 'background 0.2s' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
