'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type LinkData = {
  link: { code: string; destination_url: string; blast_id: string; contact_id: string }
  track: { title: string; artist: string; url: string; label?: string } | null
  contact_name: string | null
}

const reactions = [
  { label: 'Will Play', value: 'will_play' },
  { label: 'Liked It', value: 'liked' },
]

export default function PromoClient() {
  const params = useParams()
  const code = params.code as string

  const [data, setData] = useState<LinkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedReaction, setSelectedReaction] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [destinationUrl, setDestinationUrl] = useState('')

  useEffect(() => {
    if (!code) return
    fetch(`/api/promo-click?code=${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [code])

  async function submitReaction(value: string) {
    setSelectedReaction(value)
    setSubmitting(true)
    try {
      const res = await fetch('/api/promo-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, reaction: value }),
      })
      const result = await res.json()
      if (result.ok) {
        setDestinationUrl(result.destination_url)
        setUnlocked(true)
      }
    } catch {
      // silently fail — they can try again
    } finally {
      setSubmitting(false)
    }
  }

  // Build SoundCloud embed URL — handle private links with /s-TOKEN suffix
  let scEmbedUrl: string | null = null
  if (data?.track?.url) {
    const scUrl = data.track.url
    const secretMatch = scUrl.match(/\/s-([a-zA-Z0-9]+)$/)
    const baseUrl = secretMatch ? scUrl.replace(/\/s-[a-zA-Z0-9]+$/, '') : scUrl
    const secretParam = secretMatch ? `&secret_token=s-${secretMatch[1]}` : ''
    const isPlaylist = baseUrl.includes('/sets/')
    scEmbedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(baseUrl)}${secretParam}&color=%23b08d57&auto_play=false&show_artwork=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false${isPlaylist ? '&show_playcount=false' : ''}`
  }

  // Playlist/EP needs more height to show tracklist
  const isPlaylist = data?.track?.url?.includes('/sets/') ?? false

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loadingPulse} />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ color: '#8a4a3a', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '0.85rem' }}>
            {error || 'Link not found'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header — NM logo */}
        <div style={styles.header}>
          <img
            src="/nm-logo-bw-sm.png"
            alt="Night Manoeuvres"
            style={{ height: 120, display: 'block', margin: '0 auto', filter: 'invert(1) sepia(0.15) saturate(0.6) brightness(0.92)', opacity: 0.9 }}
          />
          {data.contact_name && (
            <p style={styles.greeting}>For {data.contact_name}</p>
          )}
        </div>

        {/* Track info */}
        {data.track && (
          <div style={styles.trackInfo}>
            <h1 style={styles.trackTitle}>{data.track.title}</h1>
            {data.track.artist && (
              <p style={styles.trackArtist}>{data.track.artist}</p>
            )}
            {data.track.label && (
              <p style={styles.trackLabel}>{data.track.label}</p>
            )}
          </div>
        )}

        {/* SoundCloud player */}
        {scEmbedUrl && (
          <div style={styles.playerWrapper}>
            <iframe
              width="100%"
              height={isPlaylist ? 300 : 166}
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              src={scEmbedUrl}
              style={{ borderRadius: 8 }}
            />
          </div>
        )}

        {/* Reaction gate */}
        {!unlocked ? (
          <div style={styles.reactionSection}>
            <p style={styles.reactionPrompt}>
              What do you think? Drop a reaction to unlock the download.
            </p>
            <div style={styles.reactionGrid}>
              {reactions.map(r => (
                <button
                  key={r.value}
                  onClick={() => submitReaction(r.value)}
                  disabled={submitting}
                  style={{
                    ...styles.reactionButton,
                    ...(selectedReaction === r.value ? styles.reactionButtonActive : {}),
                    opacity: submitting && selectedReaction !== r.value ? 0.4 : 1,
                  }}
                >
                  <span style={styles.reactionLabel}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.unlockedSection}>
            <p style={styles.thanksText}>Thanks for the feedback</p>
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.downloadButton}
            >
              Download
            </a>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <a href="/waitlist" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            <span style={styles.footerText}>Powered by</span>
            <svg width={20} height={20} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.5 }}>
              <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" strokeWidth="1.5" opacity="0.25" />
              <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span style={styles.footerBrand}>Signal Lab OS</span>
          </a>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#050505',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#0e0e0e',
    border: '1px solid #222222',
    borderRadius: 16,
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    textAlign: 'center',
  },
  greeting: {
    marginTop: 8,
    fontSize: '0.8rem',
    color: '#909090',
  },
  trackInfo: {
    textAlign: 'center',
  },
  trackTitle: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: '1.3rem',
    fontWeight: 300,
    color: '#f2f2f2',
    lineHeight: 1.3,
  },
  trackArtist: {
    marginTop: 6,
    fontSize: '0.85rem',
    color: '#909090',
  },
  trackLabel: {
    marginTop: 4,
    fontSize: '0.7rem',
    color: '#6a6862',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
  playerWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  reactionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'center',
  },
  reactionPrompt: {
    fontSize: '0.85rem',
    color: '#909090',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  reactionGrid: {
    display: 'flex',
    gap: 10,
    width: '100%',
  },
  reactionButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 8px',
    background: '#1d1d1d',
    border: '1px solid #222222',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#f2f2f2',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  reactionButtonActive: {
    background: '#2a2520',
    borderColor: '#ff2a1a',
    boxShadow: '0 0 20px rgba(255, 42, 26, 0.15)',
  },
  reactionLabel: {
    fontSize: '0.75rem',
    color: '#909090',
    textAlign: 'center',
    letterSpacing: '0.05em',
  },
  unlockedSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '8px 0',
  },
  thanksText: {
    fontSize: '0.9rem',
    color: '#f2f2f2',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 300,
  },
  downloadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '14px 32px',
    background: '#ff2a1a',
    color: '#050505',
    borderRadius: 10,
    fontSize: '0.85rem',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.2s',
    letterSpacing: '0.03em',
  },
  footer: {
    textAlign: 'center',
    paddingTop: 8,
    borderTop: '1px solid #1d1d1d',
  },
  footerLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    textDecoration: 'none',
  },
  footerText: {
    fontSize: '0.6rem',
    color: '#4a4845',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  footerBrand: {
    fontSize: '0.65rem',
    color: '#6a6862',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 300,
    letterSpacing: '0.05em',
  },
  loadingPulse: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#ff2a1a',
    opacity: 0.3,
    margin: '60px auto',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}
