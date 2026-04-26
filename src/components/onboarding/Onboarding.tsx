'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  spotifyUrl?: string
  soundcloud?: string | null
  bandcamp?: string | null
  links?: { platform: string; url: string }[]
  tracks?: { title: string; bpm: number }[]
  instagram?: string | null
  upcomingGigs?: { title: string; venue: string; location: string; date: string; status: string }[]
  sources?: string[]
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
  // Trusted one-shot onboarding import — bypasses the tier gig cap because the
  // user hasn't picked a tier yet and these are public-record upcoming shows
  // from RA/Spotify discovery, not new bookings.
  try {
    const res = await fetch('/api/onboarding/save-gigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gigs }),
    })
    const json = await res.json().catch(() => ({}))
    return json?.inserted || 0
  } catch {
    return 0
  }
}

// ── Animated wrapper for step transitions ──
function StepTransition({ show, children }: { show: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 500)
      return () => clearTimeout(t)
    }
  }, [show])

  if (!mounted) return null

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {children}
    </div>
  )
}

// ── Staggered item reveal ──
function StaggerItem({ index, children, baseDelay = 0 }: { index: number; children: React.ReactNode; baseDelay?: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), baseDelay + index * 80)
    return () => clearTimeout(t)
  }, [index, baseDelay])

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
    }}>
      {children}
    </div>
  )
}


export default function Onboarding() {
  const router = useRouter()

  // Steps: -1=curtain, 0=name, 1=confirm, 2=alignment, 3=launch
  const [step, setStep] = useState(-1)

  // Curtain
  const [curtainPhase, setCurtainPhase] = useState(0) // 0=dark, 1=text visible, 2=line sweep, 3=fade out

  // Step 0
  const [artistName, setArtistName] = useState('')
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const discoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 1
  const [fixingInsta, setFixingInsta] = useState(false)
  const [customHandle, setCustomHandle] = useState('')

  // Step 2
  const [aligned, setAligned] = useState<string[]>([])
  const [customArtist, setCustomArtist] = useState('')

  // Step 3
  const [launchPhase, setLaunchPhase] = useState(0) // 0=entering, 1=text, 2=flash, 3=redirect

  // ── Curtain sequence ──
  const curtainRan = useRef(false)
  useEffect(() => {
    if (curtainRan.current) return
    curtainRan.current = true
    setTimeout(() => setCurtainPhase(1), 300)
    setTimeout(() => setCurtainPhase(2), 1200)
    setTimeout(() => setCurtainPhase(3), 2200)
    setTimeout(() => setStep(0), 2800)
  })

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

  const finish = useCallback(async () => {
    setStep(3)
    setLaunchPhase(0)

    const instaHandle = fixingInsta
      ? customHandle.replace('@', '').trim() || null
      : (discovery?.instagram || null)

    // Start saving immediately
    const savePromise = Promise.all([
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
        links: [
          discovery?.raUrl && { platform: 'ra', url: discovery.raUrl },
          discovery?.spotifyUrl && { platform: 'spotify', url: discovery.spotifyUrl },
          discovery?.soundcloud && { platform: 'soundcloud', url: discovery.soundcloud },
          discovery?.bandcamp && { platform: 'bandcamp', url: discovery.bandcamp },
        ].filter(Boolean),
        tracks: discovery?.tracks || null,
        instagram: instaHandle,
      }),
    ])

    // Fire Instagram voice scan in background
    if (instaHandle) {
      fetch('/api/artist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artistName, handle: instaHandle }),
      }).catch(() => {})
    }

    // Launch sequence — cinematic timing
    setTimeout(() => setLaunchPhase(1), 100)
    setTimeout(() => setLaunchPhase(2), 1400)

    // Wait for both save AND minimum drama time
    await Promise.all([
      savePromise,
      new Promise(r => setTimeout(r, 2200)),
    ])

    setLaunchPhase(3)
    // Fresh signups land on /pricing to pick a tier — they have tier='free'
    // until checkout completes, so paid surfaces would be locked anyway.
    // Existing users (re-running onboarding) keep going to dashboard.
    setTimeout(async () => {
      try {
        const r = await fetch('/api/billing/status').then(x => x.json()).catch(() => null)
        const hasPaidTier = r?.tier && r.tier !== 'free'
        router.push(hasPaidTier ? '/dashboard' : '/pricing?welcome=1')
      } catch {
        router.push('/pricing?welcome=1')
      }
    }, 400)
  }, [fixingInsta, customHandle, discovery, artistName, aligned, router])

  const gigCount = discovery?.upcomingGigs?.length || 0
  const instagram = fixingInsta
    ? (customHandle.replace('@', '') || null)
    : (discovery?.instagram || null)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ── Ambient gold glow — always present, subtle ── */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: '800px',
        height: '800px',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(255,42,26,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ maxWidth: '600px', width: '100%', position: 'relative', zIndex: 1 }}>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACT 0 — THE CURTAIN
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === -1 && (
          <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            zIndex: 100,
            opacity: curtainPhase >= 3 ? 0 : 1,
            transition: 'opacity 0.6s ease-out',
          }}>
            {/* Emblem */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-icon.svg"
              alt=""
              style={{
                height: 'clamp(56px, 10vw, 80px)',
                opacity: curtainPhase >= 1 ? 1 : 0,
                transform: curtainPhase >= 1 ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
                transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                marginBottom: '24px',
              }}
            />

            {/* Wordmark */}
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 200,
              letterSpacing: '0.02em',
              color: 'var(--text)',
              opacity: curtainPhase >= 1 ? 1 : 0,
              transform: curtainPhase >= 1 ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.12s',
              textAlign: 'center',
            }}>
              Signal Lab <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.55em', letterSpacing: '0.15em', verticalAlign: '0.1em' }}>OS</span>
            </div>

            {/* Gold line sweep */}
            <div style={{
              width: curtainPhase >= 2 ? '120px' : '0px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
              marginTop: '28px',
              transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />

            {/* Tagline */}
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.3em',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              marginTop: '16px',
              opacity: curtainPhase >= 2 ? 1 : 0,
              transition: 'opacity 0.6s ease-out 0.2s',
            }}>
              Tailored Artist OS
            </div>
          </div>
        )}


        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACT 1 — THE NAME
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <StepTransition show={step === 0}>
          <div>
            {/* Subtle section marker */}
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.4em',
              color: 'var(--gold)',
              textTransform: 'uppercase',
              marginBottom: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: 'var(--gold)', opacity: 0.4 }} />
              01
            </div>

            {/* Hero heading */}
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 'clamp(36px, 6vw, 60px)',
              fontWeight: 200,
              letterSpacing: '-0.03em',
              lineHeight: 1.0,
              marginBottom: '48px',
            }}>
              What are you<br />
              <span style={{ color: 'var(--gold)' }}>known as?</span>
            </div>

            {/* Input */}
            <div style={{ marginBottom: '32px' }}>
              <input
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && artistName.trim()) setStep(1) }}
                placeholder="Your artist name"
                autoFocus
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 'clamp(20px, 3vw, 28px)',
                  fontWeight: 200,
                  padding: '16px 0',
                  outline: 'none',
                  letterSpacing: '-0.01em',
                  transition: 'border-color 0.3s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />

              {/* Discovery status */}
              {discovering && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '16px',
                }}>
                  <div style={{
                    width: '32px',
                    height: '1px',
                    background: 'var(--gold)',
                    animation: 'scanPulse 1.5s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    Scanning
                  </span>
                </div>
              )}

              {/* Found card */}
              {discovery?.found && !discovering && (
                <div style={{
                  marginTop: '20px',
                  padding: '20px',
                  background: 'rgba(255,42,26,0.04)',
                  border: '1px solid rgba(255,42,26,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  animation: 'revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                  {discovery.imageUrl && (
                    <div style={{
                      width: '48px',
                      height: '48px',
                      flexShrink: 0,
                      backgroundImage: `url(${discovery.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderRadius: '2px',
                      opacity: 0.9,
                    }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: 'var(--gold)', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '6px' }}>Found on RA</div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 300 }}>
                      {discovery.artistName || artistName}
                      {discovery.country && <span style={{ color: 'var(--text-dimmer)', marginLeft: '8px' }}>{discovery.country}</span>}
                    </div>
                    {gigCount > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
                        {gigCount} upcoming show{gigCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {discovery && !discovery.found && !discovering && artistName.trim().length >= 3 && (
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '16px', letterSpacing: '0.05em' }}>
                  No profile found — we&apos;ll set you up manually.
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={() => setStep(1)}
              disabled={!artistName.trim()}
              style={{
                background: artistName.trim() ? 'var(--gold)' : 'transparent',
                color: artistName.trim() ? '#050505' : 'var(--text-dimmer)',
                border: `1px solid ${artistName.trim() ? 'var(--gold)' : 'var(--border)'}`,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                padding: '20px',
                cursor: artistName.trim() ? 'pointer' : 'default',
                width: '100%',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {discovery?.found ? "That's me" : artistName.trim() ? 'Continue' : 'Enter your name'}
            </button>

            {/* Progress */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '48px', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: i === 0 ? '24px' : '6px',
                  height: '2px',
                  background: i === 0 ? 'var(--gold)' : 'var(--border)',
                  borderRadius: '1px',
                  transition: 'all 0.4s ease',
                }} />
              ))}
            </div>
          </div>
        </StepTransition>


        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACT 2 — THE REVEAL
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <StepTransition show={step === 1}>
          <div>
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.4em',
              color: 'var(--gold)',
              textTransform: 'uppercase',
              marginBottom: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: 'var(--gold)', opacity: 0.4 }} />
              02
            </div>

            {discovery?.found ? (
              <>
                <div style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 'clamp(36px, 6vw, 60px)',
                  fontWeight: 200,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.0,
                  marginBottom: '48px',
                }}>
                  We found<br />
                  <span style={{ color: 'var(--gold)' }}>you.</span>
                </div>

                {/* RA Profile card — staggered reveal */}
                <StaggerItem index={0}>
                  <div style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border-dim)',
                    padding: '28px',
                    marginBottom: '12px',
                  }}>
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                      {discovery.imageUrl && (
                        <div style={{
                          width: '88px',
                          height: '88px',
                          flexShrink: 0,
                          backgroundImage: `url(${discovery.imageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          border: '1px solid var(--border-dim)',
                        }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '20px',
                          color: 'var(--text)',
                          fontWeight: 200,
                          marginBottom: '8px',
                          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                          letterSpacing: '-0.01em',
                        }}>
                          {discovery.artistName || artistName}
                        </div>
                        {(discovery.genres?.length ?? 0) > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                            {discovery.genres!.slice(0, 3).map(g => (
                              <span key={g} style={{
                                fontSize: '10px',
                                color: 'var(--gold)',
                                background: 'rgba(255,42,26,0.08)',
                                border: '1px solid rgba(255,42,26,0.2)',
                                padding: '4px 12px',
                                letterSpacing: '0.1em',
                              }}>
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                          {discovery.country && <span>{discovery.country}</span>}
                          {discovery.raUrl && (
                            <a href={discovery.raUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-dimmer)', textDecoration: 'none', marginLeft: discovery.country ? 12 : 0, opacity: 0.7 }}>
                              ra.co ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </StaggerItem>

                {/* Upcoming shows */}
                {gigCount > 0 && (
                  <StaggerItem index={1}>
                    <div style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border-dim)',
                      padding: '24px 28px',
                      marginBottom: '12px',
                    }}>
                      <div style={{
                        fontSize: '9px',
                        letterSpacing: '0.3em',
                        color: 'var(--gold)',
                        textTransform: 'uppercase',
                        marginBottom: '16px',
                      }}>
                        {gigCount} upcoming show{gigCount !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {discovery.upcomingGigs!.slice(0, 4).map((g, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: 'var(--text-dim)' }}>
                              {g.venue}{g.location ? `, ${g.location.split(',')[0]}` : ''}
                            </span>
                            <span style={{ color: 'var(--text-dimmer)', fontVariantNumeric: 'tabular-nums' }}>
                              {g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                            </span>
                          </div>
                        ))}
                        {gigCount > 4 && (
                          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>+{gigCount - 4} more</div>
                        )}
                      </div>
                    </div>
                  </StaggerItem>
                )}

                {/* Instagram */}
                <StaggerItem index={gigCount > 0 ? 2 : 1}>
                  <div style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border-dim)',
                    padding: '24px 28px',
                    marginBottom: '32px',
                  }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>Instagram</div>
                    {!fixingInsta ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {instagram ? (
                          <div style={{ fontSize: '14px', color: 'var(--text)' }}>@{instagram}</div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>Not found</div>
                        )}
                        <button
                          onClick={() => { setFixingInsta(true); setCustomHandle(instagram || '') }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-dimmer)',
                            fontSize: '10px',
                            letterSpacing: '0.15em',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono)',
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px',
                            paddingRight: 0,
                          }}
                        >
                          {instagram ? 'change' : 'add'}
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
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '14px',
                          padding: '8px 0',
                          outline: 'none',
                        }}
                      />
                    )}
                  </div>
                </StaggerItem>
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 'clamp(36px, 6vw, 60px)',
                  fontWeight: 200,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.0,
                  marginBottom: '16px',
                }}>
                  Tell us about<br />
                  <span style={{ color: 'var(--gold)' }}>{artistName}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.8', marginBottom: '32px' }}>
                  We&apos;ll fill in the rest as you go.
                </p>
                <div style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border-dim)',
                  padding: '28px',
                  marginBottom: '32px',
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>Genre</div>
                    <input
                      placeholder="Techno, Deep House, Electro..."
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        padding: '8px 0',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>Instagram</div>
                    <input
                      value={customHandle}
                      onChange={e => setCustomHandle(e.target.value.replace('@', ''))}
                      placeholder="yourhandle"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        padding: '8px 0',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* CTA */}
            <StaggerItem index={gigCount > 0 ? 3 : 2}>
              <button
                onClick={() => setStep(2)}
                style={{
                  background: 'var(--gold)',
                  color: '#050505',
                  border: '1px solid var(--gold)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  padding: '20px',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.3s',
                }}
              >
                {discovery?.found ? "That's me" : 'Continue'}
              </button>
              <button
                onClick={() => setStep(0)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dimmer)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  padding: '16px',
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: '4px',
                }}
              >
                ← Back
              </button>
            </StaggerItem>

            {/* Progress */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '40px', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: i === 1 ? '24px' : '6px',
                  height: '2px',
                  background: i <= 1 ? 'var(--gold)' : 'var(--border)',
                  borderRadius: '1px',
                  transition: 'all 0.4s ease',
                }} />
              ))}
            </div>
          </div>
        </StepTransition>


        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACT 3 — SOUND ALIGNMENT
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <StepTransition show={step === 2}>
          <div>
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.4em',
              color: 'var(--gold)',
              textTransform: 'uppercase',
              marginBottom: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: 'var(--gold)', opacity: 0.4 }} />
              03
            </div>

            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 'clamp(36px, 6vw, 60px)',
              fontWeight: 200,
              letterSpacing: '-0.03em',
              lineHeight: 1.0,
              marginBottom: '16px',
            }}>
              Who sounds<br />
              <span style={{ color: 'var(--gold)' }}>like you?</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '40px', lineHeight: '1.8' }}>
              Pick up to 5. Shapes how the OS writes for you.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {ALIGNMENT_ARTISTS.map((name, i) => {
                const selected = aligned.includes(name)
                const maxed = aligned.length >= 5 && !selected
                return (
                  <StaggerItem key={name} index={i} baseDelay={100}>
                    <button
                      onClick={() => !maxed && toggleArtist(name)}
                      style={{
                        background: selected ? 'rgba(255,42,26,0.1)' : 'var(--panel)',
                        border: `1px solid ${selected ? 'var(--gold)' : 'var(--border-dim)'}`,
                        color: selected ? 'var(--gold)' : maxed ? 'var(--text-dimmer)' : 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        letterSpacing: '0.06em',
                        padding: '11px 18px',
                        cursor: maxed ? 'default' : 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        opacity: maxed ? 0.35 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </button>
                  </StaggerItem>
                )
              })}

              {aligned.filter(a => !ALIGNMENT_ARTISTS.includes(a)).map(name => (
                <button
                  key={name}
                  onClick={() => toggleArtist(name)}
                  style={{
                    background: 'rgba(255,42,26,0.1)',
                    border: '1px solid var(--gold)',
                    color: 'var(--gold)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    letterSpacing: '0.06em',
                    padding: '11px 18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name} <span style={{ fontSize: '14px', lineHeight: 1, color: 'var(--text-dimmer)' }}>×</span>
                </button>
              ))}
            </div>

            {aligned.length < 5 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  value={customArtist}
                  onChange={e => setCustomArtist(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomArtist() }}
                  placeholder="Add your own..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    padding: '10px 0',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={addCustomArtist}
                  disabled={!customArtist.trim()}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    padding: '10px 16px',
                    cursor: customArtist.trim() ? 'pointer' : 'default',
                    opacity: customArtist.trim() ? 1 : 0.3,
                    flexShrink: 0,
                    transition: 'opacity 0.2s',
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {aligned.length > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', letterSpacing: '0.15em', marginBottom: '28px', marginTop: '12px' }}>
                {aligned.length}/5 selected
              </div>
            )}

            <button
              onClick={finish}
              disabled={aligned.length === 0}
              style={{
                background: aligned.length > 0 ? 'var(--gold)' : 'transparent',
                color: aligned.length > 0 ? '#050505' : 'var(--text-dimmer)',
                border: `1px solid ${aligned.length > 0 ? 'var(--gold)' : 'var(--border)'}`,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                padding: '20px',
                cursor: aligned.length > 0 ? 'pointer' : 'default',
                width: '100%',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              Let&apos;s go
            </button>
            <button
              onClick={finish}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dimmer)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.1em',
                padding: '16px',
                cursor: 'pointer',
                width: '100%',
                marginTop: '4px',
              }}
            >
              Skip
            </button>

            {/* Progress */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '40px', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: i === 2 ? '24px' : '6px',
                  height: '2px',
                  background: 'var(--gold)',
                  borderRadius: '1px',
                  transition: 'all 0.4s ease',
                }} />
              ))}
            </div>
          </div>
        </StepTransition>


        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACT 4 — THE LAUNCH
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <StepTransition show={step === 3}>
          <div style={{
            textAlign: 'center',
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Gold flash overlay */}
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--gold)',
              opacity: launchPhase === 2 ? 0.06 : 0,
              transition: 'opacity 0.4s ease-out',
              pointerEvents: 'none',
              zIndex: 50,
            }} />

            {/* Artist name — large */}
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 200,
              letterSpacing: '-0.02em',
              color: 'var(--text)',
              marginBottom: '16px',
              opacity: launchPhase >= 1 ? 1 : 0,
              transform: launchPhase >= 1 ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
              transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              {artistName}
            </div>

            {/* Gold line */}
            <div style={{
              width: launchPhase >= 1 ? '80px' : '0px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
              marginBottom: '20px',
              transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s',
            }} />

            {/* Status text */}
            <div style={{
              fontSize: '11px',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: launchPhase >= 2 ? 'var(--gold)' : 'var(--text-dimmer)',
              opacity: launchPhase >= 1 ? 1 : 0,
              transition: 'all 0.5s ease-out 0.5s',
            }}>
              {launchPhase >= 2 ? "You're in" : 'Building your OS'}
            </div>

            {/* Subtle loading dots before "You're in" */}
            {launchPhase < 2 && launchPhase >= 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '24px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--gold)',
                    animation: `launchPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            )}

            {/* Final fade-to-white before redirect */}
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--bg)',
              opacity: launchPhase >= 3 ? 1 : 0,
              transition: 'opacity 0.4s ease-out',
              pointerEvents: 'none',
              zIndex: 60,
            }} />
          </div>
        </StepTransition>

      </div>

      {/* ── Global animations ── */}
      <style>{`
        @keyframes scanPulse {
          0%, 100% { opacity: 0.3; width: 16px; }
          50% { opacity: 1; width: 48px; }
        }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes launchPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        /* Remove arrows on inputs */
        input::placeholder {
          color: var(--text-dimmer);
          opacity: 0.6;
        }
        input:focus::placeholder {
          opacity: 0.3;
        }
      `}</style>
    </div>
  )
}
