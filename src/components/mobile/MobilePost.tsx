'use client'

/**
 * MobilePost — single-platform mobile broadcast composer.
 * One platform at a time. Opens MobileApprovalGate for preview + send.
 * Cross-posting happens on desktop (Broadcast Lab).
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRT } from '@/lib/design/brt'
import { MobileApprovalGate } from '@/components/mobile/MobileApprovalGate'

type Platform = 'ig_feed' | 'ig_reels' | 'tiktok' | 'threads'

const PLATFORM_LABELS: Record<Platform, string> = {
  ig_feed: 'Instagram Feed',
  ig_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  threads: 'Threads',
}

const C = BRT

export default function MobilePost() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [platform, setPlatform] = useState<Platform>('ig_reels')
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [showGate, setShowGate] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  function pickMedia() {
    fileRef.current?.click()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setMediaFile(f)
    setMediaUrl(URL.createObjectURL(f))
  }

  const canReview = caption.trim().length > 0 || !!mediaFile

  async function onApprove() {
    setSending(true)
    try {
      // POST flow delegated to desktop pipelines in this mobile variant.
      // For now, we simulate success so the Approval Gate behaviour is end-to-end.
      await new Promise(r => setTimeout(r, 600))
      setSending(false)
      setShowGate(false)
      setDone(true)
    } catch {
      setSending(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.22em',
    color: C.inkDim,
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: 10,
  }

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.ink,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      paddingBottom: 96,
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 16px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${C.divide}`,
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontWeight: 800,
          color: C.ink,
        }}>
          New post
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            color: C.inkDim,
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
            minHeight: 44,
            padding: '0 6px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      {done ? (
        <div style={{ padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Queued
          </div>
          <div style={{ fontSize: 13, color: C.inkDim, marginBottom: 28 }}>
            {when === 'schedule' ? 'Scheduled for ' + (scheduledAt || 'later') : 'Posting now'}
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: C.red,
              color: C.bg,
              border: 'none',
              padding: '16px 28px',
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Back to Home
          </button>
        </div>
      ) : (
        <>
          {/* Media */}
          <div style={{ padding: '16px' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={pickMedia}
              style={{
                width: '100%',
                minHeight: 180,
                background: C.surface,
                border: `1px dashed ${C.divide}`,
                color: C.ink,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: 0,
              }}
            >
              {mediaUrl ? (
                mediaFile?.type.startsWith('video/') ? (
                  <video src={mediaUrl} style={{ width: '100%', maxHeight: 320, display: 'block' }} controls />
                ) : (
                  <img src={mediaUrl} alt="" style={{ width: '100%', maxHeight: 320, display: 'block', objectFit: 'cover' }} />
                )
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, color: C.inkDim, marginBottom: 8 }}>+</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.inkDim, fontWeight: 700 }}>
                    Add media
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Caption */}
          <div style={{ padding: '0 16px 16px' }}>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Caption..."
              rows={4}
              style={{
                width: '100%',
                background: C.surface,
                border: `1px solid ${C.divide}`,
                color: C.ink,
                fontFamily: 'inherit',
                fontSize: 14,
                padding: '14px 14px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Channel picker */}
          <div style={{ padding: '0 16px 16px' }}>
            <div style={labelStyle}>Channel</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map(p => {
                const active = platform === p
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      background: active ? 'rgba(255,42,26,0.08)' : C.surface,
                      border: `1px solid ${active ? C.red : C.divide}`,
                      color: active ? C.red : C.ink,
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      letterSpacing: '0.06em',
                      textAlign: 'left',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      border: `1.5px solid ${active ? C.red : C.inkDim}`,
                      background: active ? C.red : 'transparent',
                      flexShrink: 0,
                    }} />
                    {PLATFORM_LABELS[p]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* When */}
          <div style={{ padding: '0 16px 20px' }}>
            <div style={labelStyle}>When</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['now', 'schedule'] as const).map(w => {
                const active = when === w
                return (
                  <button
                    key={w}
                    onClick={() => setWhen(w)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: active ? C.red : C.surface,
                      border: `1px solid ${active ? C.red : C.divide}`,
                      color: active ? C.bg : C.ink,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    {w === 'now' ? 'Now' : 'Schedule'}
                  </button>
                )
              })}
            </div>
            {when === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{
                  width: '100%',
                  background: C.surface,
                  border: `1px solid ${C.divide}`,
                  color: C.ink,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  padding: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  minHeight: 44,
                }}
              />
            )}
          </div>

          {/* Review & approve */}
          <div style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 64,
            padding: '12px 16px',
            background: C.bg,
            borderTop: `1px solid ${C.divide}`,
          }}>
            <button
              onClick={() => setShowGate(true)}
              disabled={!canReview}
              style={{
                width: '100%',
                minHeight: 56,
                background: canReview ? C.red : C.surface,
                border: 'none',
                color: canReview ? C.bg : C.inkDim,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                cursor: canReview ? 'pointer' : 'default',
              }}
            >
              Review & approve →
            </button>
          </div>
        </>
      )}

      {showGate && (
        <MobileApprovalGate
          title={when === 'schedule' ? 'Schedule post' : 'Publish post'}
          summary={`${PLATFORM_LABELS[platform]} · ${when === 'schedule' ? scheduledAt || 'later' : 'now'}`}
          mediaUrl={mediaUrl}
          mediaType={mediaFile?.type.startsWith('video/') ? 'video' : 'image'}
          caption={caption}
          sending={sending}
          approveLabel={when === 'schedule' ? 'Schedule' : 'Publish'}
          onApprove={onApprove}
          onCancel={() => setShowGate(false)}
        />
      )}
    </div>
  )
}
