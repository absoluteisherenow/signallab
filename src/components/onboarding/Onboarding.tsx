'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Track {
  title: string
  artist: string
  bpm: string
  key: string
}

const KEYS = ['A minor','C major','D minor','E minor','F major','G major','B minor','Eb major','F# minor','Bb major','C# minor','Ab major']
const GENRES = ['Electronic','Deep House','Techno','Ambient','Drum & Bass','UK Garage','Afrobeats','Hip Hop','Pop','R&B','Experimental']

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

async function saveProfile(profile: Record<string, any>) {
  const existing = await fetch('/api/settings').then(r => r.json()).catch(() => ({}))
  const current = existing.settings || {}
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: { ...current.profile, ...profile },
      team: current.team || [],
      advance: current.advance || {},
    }),
  })
}

export default function Onboarding() {
  const router = useRouter()

  // Steps: 0=welcome, 1=sound profile, 2=tracks, 3=analysing, 4=result
  const [step, setStep] = useState(0)

  // Step 0
  const [artistName, setArtistName] = useState('')
  const [genre, setGenre] = useState('Electronic')

  // Step 1 — sound profile
  const [soundsLike, setSoundsLike] = useState<string[]>([])
  const [newRef, setNewRef] = useState('')
  const [keyCenter, setKeyCenter] = useState('A minor')
  const [bpmRange, setBpmRange] = useState('120–130')
  const [making, setMaking] = useState('')

  // Step 1 — rider
  const [techRider, setTechRider] = useState('')
  const [hospitalityRider, setHospitalityRider] = useState('')
  const [showRider, setShowRider] = useState(false)

  // Step 2 — tracks
  const [tracks, setTracks] = useState<Track[]>([
    { title: '', artist: '', bpm: '', key: '' },
    { title: '', artist: '', bpm: '', key: '' },
    { title: '', artist: '', bpm: '', key: '' },
  ])
  const [analysis, setAnalysis] = useState('')

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  const input: React.CSSProperties = {
    width: '100%', background: s.panel, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '13px',
    padding: '12px 16px', outline: 'none', boxSizing: 'border-box',
  }

  const selectStyle: React.CSSProperties = {
    ...input, appearance: 'none', cursor: 'pointer',
  }

  function addRef() {
    const v = newRef.trim()
    if (v && soundsLike.length < 6 && !soundsLike.includes(v)) {
      setSoundsLike(p => [...p, v])
      setNewRef('')
    }
  }

  function removeRef(i: number) {
    setSoundsLike(p => p.filter((_, idx) => idx !== i))
  }

  function updateTrack(index: number, field: keyof Track, value: string) {
    setTracks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t))
  }

  const filledTracks = tracks.filter(t => t.title || t.artist).length

  async function analyseAndSave() {
    if (filledTracks < 2) return
    setStep(3)

    // Save profile
    await saveProfile({
      name: artistName,
      genre,
      soundsLike,
      keyCenter,
      bpmRange,
      making,
      techRider,
      hospitalityRider,
    })

    // Analyse set
    const filled = tracks.filter(t => t.title || t.artist)
    const trackList = filled.map((t, i) =>
      `${i + 1}. ${t.artist ? t.artist + ' — ' : ''}${t.title}${t.bpm ? ` (${t.bpm} BPM` : ''}${t.key ? `, ${t.key})` : t.bpm ? ')' : ''}`
    ).join('\n')

    const result = await callClaude(
      `Analyse this DJ set opener for ${artistName || 'an electronic music artist'}:\n\n${trackList}\n\nGive a 3-sentence analysis covering: harmonic flow, energy arc, and one specific transition to watch. Be direct and specific.`
    )
    setAnalysis(result)
    setStep(4)
  }

  const progressDots = (current: number, total: number) => (
    <div style={{ display: 'flex', gap: '6px', marginTop: '32px', justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < current ? s.gold : s.border, transition: 'background 0.2s' }} />
      ))}
    </div>
  )

  const stepLabel = (n: number, total: number, label: string) => (
    <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
      Step {n} of {total} — {label}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font, padding: '40px' }}>
      <div style={{ maxWidth: '580px', width: '100%' }}>

        {/* STEP 0 — WELCOME */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.4em', color: s.gold, textTransform: 'uppercase', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
              Artist OS
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 300, letterSpacing: '0.03em', lineHeight: 1.1, marginBottom: '24px' }}>
              Let&apos;s set up<br />
              <span style={{ color: s.gold, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>your OS.</span>
            </div>
            <p style={{ fontSize: '13px', color: s.dim, lineHeight: '1.9', marginBottom: '40px', letterSpacing: '0.04em' }}>
              Two quick steps. Takes 2 minutes. The whole system uses what you tell us — content, advances, analysis, everything.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px', textAlign: 'left' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Artist or act name</div>
                <input value={artistName} onChange={e => setArtistName(e.target.value)}
                  placeholder="Night Manoeuvres"
                  style={input} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Genre / scene</div>
                <select value={genre} onChange={e => setGenre(e.target.value)} style={selectStyle}>
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => setStep(1)} disabled={!artistName.trim()} style={{
              background: artistName.trim() ? s.gold : 'transparent',
              color: artistName.trim() ? '#070706' : s.dimmer,
              border: `1px solid ${artistName.trim() ? s.gold : s.border}`,
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
              textTransform: 'uppercase', padding: '18px 48px',
              cursor: artistName.trim() ? 'pointer' : 'default', width: '100%', transition: 'all 0.2s',
            }}>
              Next →
            </button>
          </div>
        )}

        {/* STEP 1 — SOUND PROFILE */}
        {step === 1 && (
          <div>
            {stepLabel(1, 2, 'Your sound')}
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, letterSpacing: '0.04em', marginBottom: '8px' }}>
              What do you sound like?
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              This feeds every AI tool — captions, Sonix Lab, content planning. Set it once.
            </div>

            {/* Sounds like */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '10px' }}>
                Sounds like <span style={{ color: '#3a3830', textTransform: 'none', letterSpacing: 0 }}>(up to 6 references)</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {soundsLike.map((ref, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(176,141,87,0.08)', border: `1px solid rgba(176,141,87,0.25)`, padding: '6px 12px', fontSize: '12px', color: s.gold }}>
                    {ref}
                    <button onClick={() => removeRef(i)} style={{ background: 'none', border: 'none', color: s.dimmer, cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
              {soundsLike.length < 6 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={newRef} onChange={e => setNewRef(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addRef() }}
                    placeholder="Artist — Track  (press Enter)"
                    style={{ ...input, flex: 1 }} />
                  <button onClick={addRef} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 20px', cursor: 'pointer' }}>
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Key, BPM, Making */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Key centre</div>
                <select value={keyCenter} onChange={e => setKeyCenter(e.target.value)} style={selectStyle}>
                  {KEYS.map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>BPM range</div>
                <input value={bpmRange} onChange={e => setBpmRange(e.target.value)}
                  placeholder="120–130"
                  style={input} />
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>What you&apos;re making</div>
              <input value={making} onChange={e => setMaking(e.target.value)}
                placeholder="DJ tools, dark atmospheric, 6-min tracks..."
                style={input} />
            </div>

            {/* Rider — collapsible */}
            <div style={{ marginBottom: '28px' }}>
              <button
                onClick={() => setShowRider(v => !v)}
                style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', padding: 0, cursor: 'pointer' }}
              >
                {showRider ? 'Hide rider ↑' : 'Add your rider →'}
              </button>
              {showRider && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Your tech rider</div>
                    <textarea value={techRider} onChange={e => setTechRider(e.target.value)}
                      placeholder="e.g. 2x CDJ-3000, DJM-900NXS2, KRK Rokit monitors…"
                      style={{ ...input, height: '80px', resize: 'vertical' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Hospitality requirements</div>
                    <textarea value={hospitalityRider} onChange={e => setHospitalityRider(e.target.value)}
                      placeholder="e.g. Hotel near venue, return flights, meal buyout…"
                      style={{ ...input, height: '80px', resize: 'vertical' }} />
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setStep(2)} style={{
              background: s.gold, color: '#070706', border: 'none',
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
              textTransform: 'uppercase', padding: '18px', cursor: 'pointer', width: '100%',
            }}>
              Next →
            </button>
            <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}>
              Skip for now
            </button>

            {progressDots(1, 2)}
          </div>
        )}

        {/* STEP 2 — TRACKS */}
        {step === 2 && (
          <div>
            {stepLabel(2, 2, 'Your tracks')}
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, letterSpacing: '0.04em', marginBottom: '8px' }}>
              What are you playing?
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              Add 2–3 tracks from your next show. We&apos;ll analyse the harmonic flow and energy arc.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {tracks.map((track, i) => (
                <div key={i} style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '18px 20px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
                    Track {i + 1}{i === 0 ? ' — opener' : i === 1 ? ' — second' : ' — third'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <input value={track.title} onChange={e => updateTrack(i, 'title', e.target.value)}
                      placeholder="Track title"
                      style={input} />
                    <input value={track.artist} onChange={e => updateTrack(i, 'artist', e.target.value)}
                      placeholder="Artist"
                      style={input} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input value={track.bpm} onChange={e => updateTrack(i, 'bpm', e.target.value)}
                      placeholder="BPM (optional)" style={input} />
                    <input value={track.key} onChange={e => updateTrack(i, 'key', e.target.value)}
                      placeholder="Key (optional)" style={input} />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={analyseAndSave} disabled={filledTracks < 2} style={{
              background: filledTracks >= 2 ? s.gold : 'transparent',
              color: filledTracks >= 2 ? '#070706' : s.dimmer,
              border: `1px solid ${filledTracks >= 2 ? s.gold : s.border}`,
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
              textTransform: 'uppercase', padding: '18px',
              cursor: filledTracks >= 2 ? 'pointer' : 'default',
              width: '100%', transition: 'all 0.2s',
            }}>
              {filledTracks < 2 ? `Add ${2 - filledTracks} more track${2 - filledTracks > 1 ? 's' : ''} to continue` : 'Finish setup →'}
            </button>
            <button onClick={() => { saveProfile({ name: artistName, genre, soundsLike, keyCenter, bpmRange, making, techRider, hospitalityRider }); router.push('/dashboard') }}
              style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}>
              Skip — go to dashboard
            </button>

            {progressDots(2, 2)}
          </div>
        )}

        {/* STEP 3 — ANALYSING */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '32px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.gold, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '20px', fontWeight: 300, color: s.gold, marginBottom: '12px' }}>
              Setting everything up...
            </div>
            <div style={{ fontSize: '13px', color: s.dim, lineHeight: '1.7' }}>
              Saving your sound profile and analysing your set
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
          </div>
        )}

        {/* STEP 4 — RESULT */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              You&apos;re set up — {artistName}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, letterSpacing: '0.04em', marginBottom: '24px' }}>
              Here&apos;s your set analysis.
            </div>

            {analysis && (
              <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '28px 32px', marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: s.dim, lineHeight: '1.9', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                  {analysis}
                </div>
              </div>
            )}

            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '18px 20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>Your tracks</div>
              {tracks.filter(t => t.title || t.artist).map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${s.border}`, fontSize: '13px' }}>
                  <span style={{ color: s.text }}>{t.artist ? `${t.artist} — ` : ''}{t.title}</span>
                  <span style={{ color: s.dimmer }}>{t.bpm ? `${t.bpm} BPM` : ''}{t.key ? ` · ${t.key}` : ''}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => router.push('/dashboard')} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '16px', cursor: 'pointer' }}>
                Go to dashboard →
              </button>
              <button onClick={() => router.push('/setlab')} style={{ background: 'transparent', color: s.dim, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '16px', cursor: 'pointer' }}>
                Open Set Lab
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
