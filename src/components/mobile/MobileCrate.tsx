'use client'

// Mobile identified-tracks crate. Lives at /setlab/library on mobile.
// Desktop hits the full SetLab library tab.

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Track {
  id: string
  title: string | null
  artist: string | null
  bpm?: number | null
  key?: string | null
  album_art?: string | null
  spotify_url?: string | null
  preview_url?: string | null
  source?: string | null
  created_at?: string | null
}

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#181818',
  text: '#f2f2f2',
  dim: '#909090',
  dimmer: '#606060',
  red: '#ff2a1a',
}

const FONT = 'var(--font-mono)'

function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function MobileCrate() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    fetch('/api/tracks')
      .then(r => r.json())
      .then(d => setTracks(Array.isArray(d.tracks) ? d.tracks : []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false))
  }, [])

  function togglePreview(t: Track) {
    if (!t.preview_url) return
    if (previewId === t.id) {
      previewAudio?.pause()
      setPreviewId(null)
      return
    }
    previewAudio?.pause()
    const a = new Audio(t.preview_url)
    a.play().catch(() => {})
    a.addEventListener('ended', () => setPreviewId(null))
    setPreviewAudio(a)
    setPreviewId(t.id)
  }

  return (
    <div style={{
      background: COLOR.bg, minHeight: '100vh', color: COLOR.text, fontFamily: FONT,
      paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
    }}>
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${COLOR.border}`,
      }}>
        <Link href="/today" style={{
          fontSize: 10, letterSpacing: '0.2em', color: COLOR.dim, textDecoration: 'none',
        }}>← BACK</Link>
        <div style={{ fontSize: 11, letterSpacing: '0.24em', fontWeight: 700 }}>CRATE</div>
        <div style={{ fontSize: 10, color: COLOR.dimmer, letterSpacing: '0.15em' }}>
          {loading ? '…' : `${tracks.length}`}
        </div>
      </div>

      {!loading && tracks.length === 0 && (
        <div style={{ padding: '80px 24px', textAlign: 'center', color: COLOR.dim, fontSize: 13 }}>
          No tracks yet.<br />
          <span style={{ color: COLOR.dimmer, fontSize: 11 }}>
            Tap SCAN to capture vinyl, CDJ screens, tracklists, or Shazam a track.
          </span>
        </div>
      )}

      <div>
        {tracks.map(t => {
          const isPlaying = previewId === t.id
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px',
              borderBottom: `1px solid ${COLOR.border}`,
            }}>
              <button
                onClick={() => togglePreview(t)}
                disabled={!t.preview_url}
                aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                style={{
                  width: 48, height: 48, flexShrink: 0,
                  background: t.album_art ? `url(${t.album_art}) center/cover` : COLOR.panel,
                  border: `1px solid ${COLOR.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: COLOR.text, cursor: t.preview_url ? 'pointer' : 'default',
                  position: 'relative',
                }}
              >
                {t.preview_url && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: COLOR.text,
                  }}>{isPlaying ? '❚❚' : '▶'}</div>
                )}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: COLOR.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {t.title || 'Unknown title'}
                </div>
                <div style={{
                  fontSize: 11, color: COLOR.dim, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {t.artist || 'Unknown artist'}
                  {t.bpm ? ` · ${t.bpm} BPM` : ''}
                  {t.key ? ` · ${t.key}` : ''}
                </div>
              </div>

              <div style={{
                fontSize: 9, color: COLOR.dimmer, letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
              }}>{timeAgo(t.created_at)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
