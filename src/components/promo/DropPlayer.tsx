'use client'

import { useEffect, useRef, useState } from 'react'
import { WaveformDisplay } from '@/components/setlab/WaveformDisplay'

export type DropTrack = {
  id: string
  title: string
  artist: string | null
  label: string | null
  duration_sec: number | null
  waveform_peaks: number[] | null
  stream_token: string
}

type Props = {
  tracks: DropTrack[]
  dropTitle: string
  dropArtist: string
  dropLabel?: string | null
  message?: string | null
  recipientName?: string | null
  linkId: string
  code: string
}

export default function DropPlayer({
  tracks,
  dropTitle,
  dropArtist,
  dropLabel,
  message,
  recipientName,
  linkId,
  code,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState(0)
  const playIdRef = useRef<string | null>(null)
  const furthestRef = useRef<number>(0)
  const durationPlayedRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)
  const lastFlushRef = useRef<number>(0)

  const [reaction, setReaction] = useState<string | null>(null)
  const [reactionSubmitting, setReactionSubmitting] = useState(false)

  const active = tracks[activeIdx]

  async function startPlaySession(trackId: string) {
    // Flush any prior play session first
    if (playIdRef.current) {
      await flushPlay(true)
      playIdRef.current = null
    }
    furthestRef.current = 0
    durationPlayedRef.current = 0
    try {
      const r = await fetch('/api/promo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, link_id: linkId }),
      })
      const j = await r.json()
      if (j.play_id) playIdRef.current = j.play_id
    } catch {
      /* ignore */
    }
  }

  async function flushPlay(completed = false) {
    if (!playIdRef.current) return
    const body = {
      play_id: playIdRef.current,
      furthest_sec: furthestRef.current,
      duration_played_sec: durationPlayedRef.current,
      completed,
    }
    try {
      await fetch('/api/promo/play', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      })
    } catch {
      /* ignore */
    }
  }

  function handlePlay() {
    setPlaying(true)
    if (!playIdRef.current && active) startPlaySession(active.id)
  }

  function handlePause() {
    setPlaying(false)
    flushPlay(false)
  }

  function handleEnded() {
    setPlaying(false)
    flushPlay(true)
    playIdRef.current = null
  }

  function handleTimeUpdate() {
    const a = audioRef.current
    if (!a) return
    const now = a.currentTime
    const dur = a.duration || active?.duration_sec || 0

    setCurrent(now)
    setProgress(dur > 0 ? now / dur : 0)

    const dt = now - lastTickRef.current
    if (dt > 0 && dt < 2) durationPlayedRef.current += dt
    lastTickRef.current = now
    if (now > furthestRef.current) furthestRef.current = now

    // Flush every 5s while playing
    const nowMs = Date.now()
    if (nowMs - lastFlushRef.current > 5000) {
      lastFlushRef.current = nowMs
      flushPlay(false)
    }
  }

  function selectTrack(idx: number) {
    setActiveIdx(idx)
    lastTickRef.current = 0
    setProgress(0)
    setCurrent(0)
    // Audio element src will change via `src` prop below; autoplay when user clicked a track
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => {})
    })
  }

  function handleSeek(ratio: number) {
    const a = audioRef.current
    if (!a || !a.duration) return
    a.currentTime = ratio * a.duration
    lastTickRef.current = a.currentTime
  }

  async function submitReaction(value: string) {
    setReactionSubmitting(true)
    try {
      await fetch('/api/promo-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, reaction: value }),
      })
      setReaction(value)
    } finally {
      setReactionSubmitting(false)
    }
  }

  // Flush on unload
  useEffect(() => {
    const onUnload = () => {
      if (playIdRef.current) {
        const body = JSON.stringify({
          play_id: playIdRef.current,
          furthest_sec: furthestRef.current,
          duration_played_sec: durationPlayedRef.current,
          completed: false,
        })
        try {
          navigator.sendBeacon?.('/api/promo/play-end', new Blob([body], { type: 'application/json' }))
        } catch {}
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Block context menu on audio element (best-effort anti-download)
  const onContextMenu: React.MouseEventHandler = e => e.preventDefault()

  if (!active) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.empty}>No tracks in this drop yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page} onContextMenu={onContextMenu}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brandRow}>
            <span style={styles.brandTag}>NIGHT manoeuvres</span>
            <span style={styles.brandDivider}>·</span>
            <span style={styles.brandSub}>PRIVATE STREAM</span>
          </div>
          <h1 style={styles.title}>{dropTitle}</h1>
          <div style={styles.meta}>
            <span>{dropArtist}</span>
            {dropLabel && <><span style={styles.metaDot}>·</span><span>{dropLabel}</span></>}
          </div>
          {recipientName && (
            <div style={styles.greeting}>FOR {recipientName.toUpperCase()}</div>
          )}
        </div>

        {message && <p style={styles.message}>{message}</p>}

        {/* Active track player */}
        <div style={styles.playerBlock}>
          <div style={styles.activeTitle}>
            <span style={styles.activeNum}>{String(activeIdx + 1).padStart(2, '0')}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.activeTrackTitle}>{active.title}</div>
              {active.artist && <div style={styles.activeTrackArtist}>{active.artist}</div>}
            </div>
            <div style={styles.activeTime}>{formatTime(current)} / {formatTime(active.duration_sec || 0)}</div>
          </div>

          <div style={{ width: '100%' }}>
            <WaveformDisplay
              peaks={active.waveform_peaks}
              progress={progress}
              onSeek={handleSeek}
              height={64}
              color="rgba(255,42,26,0.25)"
              progressColor="rgba(255,42,26,0.95)"
            />
          </div>

          <audio
            ref={audioRef}
            src={`/api/promo/stream/${active.stream_token}`}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            controls
            controlsList="nodownload noplaybackrate"
            {...{ disablePictureInPicture: true } as any}
            preload="metadata"
            style={styles.audio}
          />
        </div>

        {/* Tracklist */}
        {tracks.length > 1 && (
          <div style={styles.tracklist}>
            {tracks.map((t, i) => {
              const isActive = i === activeIdx
              return (
                <button
                  key={t.id}
                  onClick={() => selectTrack(i)}
                  style={{
                    ...styles.trackRow,
                    ...(isActive ? styles.trackRowActive : {}),
                  }}
                >
                  <span style={styles.trackNum}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={styles.trackTitle}>{t.title}</div>
                    {t.artist && <div style={styles.trackArtist}>{t.artist}</div>}
                  </div>
                  <span style={styles.trackDur}>{formatTime(t.duration_sec || 0)}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Reaction */}
        <div style={styles.reactionBlock}>
          <div style={styles.reactionLabel}>YOUR TAKE</div>
          <div style={styles.reactionRow}>
            {REACTIONS.map(r => {
              const on = reaction === r.value
              return (
                <button
                  key={r.value}
                  disabled={reactionSubmitting}
                  onClick={() => submitReaction(r.value)}
                  style={{ ...styles.reactionBtn, ...(on ? styles.reactionBtnOn : {}) }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          {reaction && <div style={styles.thanks}>RECEIVED · THANKS</div>}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerNote}>STREAM ONLY · NO DOWNLOAD · TOKEN EXPIRES 24H</span>
        </div>
      </div>
    </div>
  )
}

const REACTIONS = [
  { label: 'INTERESTED', value: 'interested' },
  { label: 'MORE INFO', value: 'more_info' },
  { label: 'NOT THIS TIME', value: 'pass' },
]

function formatTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#050505',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    color: '#f2f2f2',
  },
  card: {
    width: '100%',
    maxWidth: 640,
    background: '#0e0e0e',
    border: '1px solid #1d1d1d',
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingBottom: 18,
    borderBottom: '1px solid #1d1d1d',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 10,
    letterSpacing: '0.12em',
    color: '#ff2a1a',
  },
  brandTag: { fontWeight: 700 },
  brandDivider: { color: '#3a3a3a' },
  brandSub: { color: '#7a7a7a' },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: 'clamp(32px, 5vw, 48px)',
    letterSpacing: '-0.03em',
    lineHeight: 0.95,
    textTransform: 'uppercase',
    margin: 0,
    color: '#f2f2f2',
  },
  meta: {
    display: 'flex',
    gap: 8,
    fontSize: 12,
    color: '#a0a0a0',
  },
  metaDot: { color: '#3a3a3a' },
  greeting: {
    marginTop: 4,
    fontSize: 10,
    letterSpacing: '0.15em',
    color: '#7a7a7a',
  },
  message: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#c0c0c0',
    whiteSpace: 'pre-wrap',
  },
  playerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: '18px 18px 10px',
    background: '#0a0a0a',
    border: '1px solid #1d1d1d',
  },
  activeTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  activeNum: {
    fontSize: 10,
    color: '#ff2a1a',
    letterSpacing: '0.1em',
    width: 28,
  },
  activeTrackTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: '-0.02em',
    textTransform: 'uppercase',
    color: '#f2f2f2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  activeTrackArtist: {
    fontSize: 11,
    color: '#7a7a7a',
    marginTop: 2,
  },
  activeTime: {
    fontSize: 11,
    color: '#7a7a7a',
  },
  audio: {
    width: '100%',
    height: 34,
    marginTop: 4,
  },
  tracklist: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #1d1d1d',
  },
  trackRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: '#0a0a0a',
    border: 'none',
    borderBottom: '1px solid #151515',
    cursor: 'pointer',
    color: '#f2f2f2',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    width: '100%',
  },
  trackRowActive: {
    background: '#140504',
    boxShadow: 'inset 2px 0 0 0 #ff2a1a',
  },
  trackNum: {
    fontSize: 10,
    color: '#7a7a7a',
    width: 24,
  },
  trackTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '-0.01em',
    textTransform: 'uppercase',
    color: '#f2f2f2',
  },
  trackArtist: {
    fontSize: 10,
    color: '#7a7a7a',
    marginTop: 2,
  },
  trackDur: {
    fontSize: 10,
    color: '#7a7a7a',
  },
  reactionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  reactionLabel: {
    fontSize: 10,
    letterSpacing: '0.12em',
    color: '#7a7a7a',
  },
  reactionRow: {
    display: 'flex',
    gap: 6,
  },
  reactionBtn: {
    flex: 1,
    padding: '12px 8px',
    background: '#0a0a0a',
    border: '1px solid #1d1d1d',
    color: '#a0a0a0',
    fontSize: 10,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
  reactionBtnOn: {
    background: '#ff2a1a',
    borderColor: '#ff2a1a',
    color: '#000',
  },
  thanks: {
    fontSize: 10,
    letterSpacing: '0.1em',
    color: '#ff2a1a',
  },
  footer: {
    paddingTop: 14,
    borderTop: '1px solid #1d1d1d',
    textAlign: 'center',
  },
  footerNote: {
    fontSize: 9,
    letterSpacing: '0.12em',
    color: '#4a4a4a',
  },
  empty: {
    fontSize: 12,
    color: '#7a7a7a',
    textAlign: 'center',
    padding: '40px 0',
  },
}
