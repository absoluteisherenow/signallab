'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const ALIGNMENT_ARTISTS = [
  'Bicep', 'Four Tet', 'Floating Points', 'Fred Again..', 'Aphex Twin',
  'Burial', 'Objekt', 'Blawan', 'Surgeon', 'Andy Stott',
  'Marcel Dettmann', 'Ben Klock', 'Paula Temple', 'Shackleton', 'Actress',
  'Shed', 'DJ Stingray', 'Karenn', 'Lone', 'DJ Koze',
  'Recondite', 'Jon Hopkins', 'Headless Horseman', 'Phase Fatale',
]

type Discovery = {
  found: boolean
  artistName?: string
  genre?: string
  genres?: string[]
  country?: string
  bio?: string
  imageUrl?: string
  raUrl?: string
  links?: { platform: string; url: string }[]
  tracks?: { title: string; bpm: number }[]
  instagram?: string | null
  upcomingGigs?: { title: string; venue: string; location: string; date: string; status: string }[]
}

async function saveProfile(profile: Record<string, unknown>) {
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

async function saveGigs(gigs: { title: string; venue: string; location: string; date: string; status: string }[]) {
  if (!gigs.length) return 0
  const results = await Promise.allSettled(
    gigs.map(gig =>
      fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gig),
      })
    )
  )
  return results.filter(r => r.status === 'fulfilled').length
}

export default function Onboarding() {
  const router = useRouter()

  // Steps: 0=name, 1=confirm, 2=alignment, 3=saving
  const [step, setStep] = useState(0)

  // Step 0
  const [artistName, setArtistName] = useState('')
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const discoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 1 — instagram fix
  const [fixingInsta, setFixingInsta] = useState(false)
  const [customHandle, setCustomHandle] = useState('')

  // Step 2 — alignment
  const [aligned, setAligned] = useState<string[]>([])
  const [customArtist, setCustomArtist] = useState('')

  // Step 3 — result
  const [savedGigCount, setSavedGigCount] = useState(0)

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
    gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  const input: React.CSSProperties = {
    width: '100%', background: s.bg, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '13px',
    padding: '11px 14px', outline: 'none', boxSizing: 'border-box',
  }

  const panelInput: React.CSSProperties = { ...input, background: s.panel }

  // Auto-discover as they type
  useEffect(() => {
    if (discoverTimer.current) clearTimeout(discoverTimer.current)
    if (artistName.trim().length < 3) { setDiscovery(null); return }
    setDiscovering(true)
    discoverTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/discover?name=${encodeURIComponent(artistName.trim())}`)
        const data = await res.json()
        setDiscovery(data)
      } catch { setDiscovery(null) } finally { setDiscovering(false) }
    }, 600)
    return () => { if (discoverTimer.current) clearTimeout(discoverTimer.current) }
  }, [artistName])

  function toggleArtist(name: string) {
    setAligned(prev =>
      prev.includes(name) ? prev.filter(a => a !== name) : prev.length < 5 ? [...prev, name] : prev
    )
  }

  function addCustomArtist() {
    const v = customArtist.trim()
    if (v && !aligned.includes(v) && aligned.length < 5) {
      setAligned(prev => [...prev, v])
      setCustomArtist('')
    }
  }

  async function finish() {
    setStep(3)

    const instaHandle = fixingInsta
      ? customHandle.replace('@', '').trim() || null
      : (discovery?.instagram || null)

    const [count] = await Promise.all([
      saveGigs(discovery?.upcomingGigs || []),
      saveProfile({
        name: artistName,
        soundsLike: aligned,
        genre: discovery?.genres?.length ? discovery.genres.join(', ') : (discovery?.genre || 'Electronic'),
        genres: discovery?.genres || [],
        country: discovery?.country || null,
        bio: discovery?.bio || null,
        imageUrl: discovery?.imageUrl || null,
        raUrl: discovery?.raUrl || null,
        links: discovery?.links || null,
        tracks: discovery?.tracks || null,
        instagram: instaHandle,
      }),
    ])

    setSavedGigCount(count)
    router.push('/dashboard')
  }

  const progressDots = (current: number, total = 3) => (
    <div style={{ display: 'flex', gap: '6px', marginTop: '32px', justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i <= current ? s.gold : s.border, transition: 'background 0.2s' }} />
      ))}
    </div>
  )

  const gigCount = discovery?.upcomingGigs?.length || 0
  const instagram = fixingInsta
    ? (customHandle.replace('@', '') || null)
    : (discovery?.instagram || null)

  return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font, padding: '40px' }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>

        {/* ── STEP 0 — ARTIST NAME ── */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.4em', color: s.gold, textTransform: 'uppercase', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
              Signal Lab OS
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
            </div>

            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '16px' }}>
              What are you<br />
              <span style={{ color: s.gold }}>known as?</span>
            </div>
            <p style={{ fontSize: '13px', color: s.dim, lineHeight: '1.9', marginBottom: '40px' }}>
              Your artist name. That&apos;s all we need to get started.
            </p>

            <div style={{ marginBottom: '32px' }}>
              <input
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && artistName.trim()) setStep(1) }}
                placeholder="Night Manoeuvres"
                style={panelInput}
                autoFocus
              />

              {discovering && (
                <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.12em', marginTop: '8px' }}>
                  Finding your profile...
                </div>
              )}

              {discovery?.found && !discovering && (
                <div style={{ background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)', padding: '12px 16px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {discovery.imageUrl && (
                    <div style={{ width: '36px', height: '36px', flexShrink: 0, backgroundImage: `url(${discovery.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '2px' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: s.gold, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '4px' }}>Found</div>
                    <div style={{ fontSize: '12px', color: s.text }}>
                      {discovery.artistName || artistName}
                      {discovery.country && <span style={{ color: s.dimmer }}> · {discovery.country}</span>}
                      {gigCount > 0 && <span style={{ color: s.dimmer }}> · {gigCount} upcoming show{gigCount !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                </div>
              )}

              {discovery && !discovery.found && !discovering && artistName.trim().length >= 3 && (
                <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '8px', letterSpacing: '0.08em' }}>
                  Not found automatically — continue and we&apos;ll set you up manually.
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={!artistName.trim()}
              style={{
                background: artistName.trim() ? s.gold : 'transparent',
                color: artistName.trim() ? '#070706' : s.dimmer,
                border: `1px solid ${artistName.trim() ? s.gold : s.border}`,
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: artistName.trim() ? 'pointer' : 'default',
                width: '100%', transition: 'all 0.2s',
              }}
            >
              {discovery?.found ? 'That looks right →' : artistName.trim() ? 'Continue →' : 'Enter your name'}
            </button>

            {progressDots(0)}
          </div>
        )}

        {/* ── STEP 1 — IS THIS YOU ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              {discovery?.found ? 'Is this you?' : 'Your profile'}
            </div>

            {discovery?.found ? (
              <>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '28px' }}>
                  We found you.
                </div>

                {/* RA Profile card */}
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    {discovery.imageUrl && (
                      <div style={{
                        width: '80px', height: '80px', flexShrink: 0,
                        backgroundImage: `url(${discovery.imageUrl})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        border: `1px solid ${s.border}`,
                      }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '18px', color: s.text, fontWeight: 300, marginBottom: '6px', fontFamily: "'Unbounded', sans-serif" }}>
                        {discovery.artistName || artistName}
                      </div>
                      {(discovery.genres?.length ?? 0) > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                          {discovery.genres!.slice(0, 3).map(g => (
                            <span key={g} style={{ fontSize: '10px', color: s.gold, background: 'rgba(176,141,87,0.1)', border: '1px solid rgba(176,141,87,0.25)', padding: '3px 10px', letterSpacing: '0.08em' }}>
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: s.dimmer }}>
                        {discovery.country && <span>{discovery.country}</span>}
                        {discovery.raUrl && (
                          <a href={discovery.raUrl} target="_blank" rel="noopener noreferrer" style={{ color: s.dimmer, textDecoration: 'none', marginLeft: discovery.country ? ' · ' : '', opacity: 0.7 }}>
                            ra.co ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upcoming shows card */}
                {gigCount > 0 && (
                  <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
                      {gigCount} upcoming show{gigCount !== 1 ? 's' : ''} — adding to your calendar
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {discovery.upcomingGigs!.slice(0, 4).map((g, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: s.dim }}>{g.venue}{g.location ? `, ${g.location.split(',')[0]}` : ''}</span>
                          <span style={{ color: s.dimmer }}>
                            {g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                          </span>
                        </div>
                      ))}
                      {gigCount > 4 && (
                        <div style={{ fontSize: '11px', color: s.dimmer }}>+{gigCount - 4} more</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Instagram card */}
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px', marginBottom: '24px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>Instagram</div>
                  {!fixingInsta ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {instagram ? (
                        <div style={{ fontSize: '14px', color: s.text }}>@{instagram}</div>
                      ) : (
                        <div style={{ fontSize: '12px', color: s.dimmer }}>Not found — add your handle</div>
                      )}
                      <button
                        onClick={() => { setFixingInsta(true); setCustomHandle(instagram || '') }}
                        style={{ background: 'transparent', border: 'none', color: s.dimmer, fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer', fontFamily: s.font, textDecoration: 'underline', paddingRight: 0 }}
                      >
                        {instagram ? 'not me' : 'add'}
                      </button>
                    </div>
                  ) : (
                    <input
                      value={customHandle}
                      onChange={e => setCustomHandle(e.target.value.replace('@', ''))}
                      onKeyDown={e => { if (e.key === 'Enter') setFixingInsta(false) }}
                      onBlur={() => setFixingInsta(false)}
                      placeholder="yourhandle"
                      autoFocus
                      style={{ ...input, fontSize: '14px' }}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '12px' }}>
                  Tell us about<br />
                  <span style={{ color: s.gold }}>{artistName}</span>
                </div>
                <p style={{ fontSize: '13px', color: s.dim, lineHeight: '1.7', marginBottom: '28px' }}>
                  Couldn&apos;t find you automatically. Fill in what you can — update the rest in Settings anytime.
                </p>
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px', marginBottom: '24px' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Genre</div>
                    <input placeholder="Electronic, Techno, Deep House..." style={input} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Instagram handle</div>
                    <input
                      value={customHandle}
                      onChange={e => setCustomHandle(e.target.value.replace('@', ''))}
                      placeholder="yourhandle"
                      style={input}
                    />
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => setStep(2)}
              style={{
                background: s.gold, color: '#070706',
                border: `1px solid ${s.gold}`,
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: 'pointer', width: '100%',
              }}
            >
              {discovery?.found ? 'That\'s me →' : 'Continue →'}
            </button>
            <button
              onClick={() => setStep(0)}
              style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}
            >
              ← Back
            </button>

            {progressDots(1)}
          </div>
        )}

        {/* ── STEP 2 — ALIGNMENT ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              Your sound
            </div>

            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '12px' }}>
              Who are you<br />most aligned with?
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              Pick up to 5. Shapes how the OS writes for you — captions, campaign copy, everything.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {ALIGNMENT_ARTISTS.map(name => {
                const selected = aligned.includes(name)
                const maxed = aligned.length >= 5 && !selected
                return (
                  <button
                    key={name}
                    onClick={() => !maxed && toggleArtist(name)}
                    style={{
                      background: selected ? 'rgba(176,141,87,0.12)' : s.panel,
                      border: `1px solid ${selected ? s.gold : '#2a2926'}`,
                      color: selected ? s.gold : maxed ? s.dimmer : s.dim,
                      fontFamily: s.font, fontSize: '12px', letterSpacing: '0.08em',
                      padding: '10px 18px', cursor: maxed ? 'default' : 'pointer',
                      transition: 'all 0.15s', opacity: maxed ? 0.45 : 1,
                    }}
                  >
                    {name}
                  </button>
                )
              })}

              {aligned.filter(a => !ALIGNMENT_ARTISTS.includes(a)).map(name => (
                <button
                  key={name}
                  onClick={() => toggleArtist(name)}
                  style={{
                    background: 'rgba(176,141,87,0.12)', border: `1px solid ${s.gold}`,
                    color: s.gold, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.08em',
                    padding: '10px 18px', cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  {name} <span style={{ fontSize: '14px', lineHeight: 1, color: s.dimmer }}>×</span>
                </button>
              ))}
            </div>

            {aligned.length < 5 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  value={customArtist}
                  onChange={e => setCustomArtist(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomArtist() }}
                  placeholder="Add your own artist..."
                  style={{ ...panelInput, flex: 1, fontSize: '12px', padding: '10px 14px' }}
                />
                <button
                  onClick={addCustomArtist}
                  disabled={!customArtist.trim()}
                  style={{
                    background: 'transparent', border: `1px solid ${s.border}`,
                    color: s.dim, fontFamily: s.font, fontSize: '10px',
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '10px 16px', cursor: customArtist.trim() ? 'pointer' : 'default',
                    opacity: customArtist.trim() ? 1 : 0.4, flexShrink: 0,
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {aligned.length > 0 && (
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.1em', marginBottom: '24px', marginTop: '8px' }}>
                {aligned.length} selected{aligned.length === 5 ? ' — max reached' : ''}
              </div>
            )}

            <button
              onClick={finish}
              disabled={aligned.length === 0}
              style={{
                background: aligned.length > 0 ? s.gold : 'transparent',
                color: aligned.length > 0 ? '#070706' : s.dimmer,
                border: `1px solid ${aligned.length > 0 ? s.gold : s.border}`,
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: aligned.length > 0 ? 'pointer' : 'default',
                width: '100%', transition: 'all 0.2s',
              }}
            >
              Finish setup →
            </button>
            <button
              onClick={finish}
              style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}
            >
              Skip
            </button>

            {progressDots(2)}
          </div>
        )}

        {/* ── STEP 3 — SAVING ── */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '40px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: s.gold,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, color: s.text, marginBottom: '12px' }}>
              Setting everything up...
            </div>
            <div style={{ fontSize: '12px', color: s.dim, letterSpacing: '0.06em' }}>
              {gigCount > 0 ? `Adding ${gigCount} shows to your calendar` : 'Building your profile'}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
          </div>
        )}

      </div>
    </div>
  )
}
