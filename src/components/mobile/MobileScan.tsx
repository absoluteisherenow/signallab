'use client'

import { useState } from 'react'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#1d1d1d',
  borderDim: '#222',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
  green: '#2ecc71',
  amber: '#f5a623',
}
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

interface CapturedTrack {
  title?: string
  artist?: string
  label?: string
  confidence?: 'high' | 'medium' | 'low'
  // enrichment (set after Spotify lookup)
  spotifyEnriched?: boolean
  spotify_id?: string
  album_art?: string | null
  preview_url?: string | null
  bpm?: number | null
  key?: string | null
  spotifyFound?: boolean
  // save state
  saved?: boolean
  saving?: boolean
}

interface ReceiptExtracted {
  description: string
  amount: number | null
  currency: string
  date: string | null
  category: string
  notes: string
}

type Mode =
  | 'choose'
  | 'crate_uploading'
  | 'crate_reading'
  | 'crate_review'
  | 'crate_empty'
  | 'crate_error'
  | 'receipt_parsing'
  | 'receipt_review'
  | 'receipt_saved'
  | 'receipt_error'

const EXPENSE_CATEGORIES = ['Travel', 'Accommodation', 'Equipment', 'Marketing', 'Venue', 'Software', 'Other']

export default function MobileScan() {
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState('')

  // Crate capture state
  const [crateImageUrl, setCrateImageUrl] = useState<string | null>(null)
  const [crateLocalPreview, setCrateLocalPreview] = useState<string | null>(null)
  const [crateTracks, setCrateTracks] = useState<CapturedTrack[]>([])
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)

  // Receipt state
  const [receipt, setReceipt] = useState<ReceiptExtracted | null>(null)

  // ----- CRATE CAPTURE -----
  function pickCrate() {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.capture = 'environment'
    inp.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) handleCrate(f)
    }
    inp.click()
  }

  async function handleCrate(file: File) {
    setError('')
    setCrateTracks([])
    setCrateImageUrl(null)
    setCrateLocalPreview(URL.createObjectURL(file))
    setMode('crate_uploading')
    try {
      // /api/sets/from-screenshot already: uploads to R2, runs Claude vision,
      // returns { tracks, imageUrl }. Prompt there covers vinyl / CDJ /
      // tracklist / screenshot sources — which is exactly what we want.
      setMode('crate_reading')
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/sets/from-screenshot', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok && !data.tracks) {
        throw new Error(data.error || 'Could not read image')
      }

      const rawTracks = Array.isArray(data.tracks) ? data.tracks : []
      const imageUrl: string = data.imageUrl || ''
      setCrateImageUrl(imageUrl)

      // Normalise + infer confidence. from-screenshot returns { title, artist, bpm, key, position }.
      const normalised: CapturedTrack[] = rawTracks
        .map((t: any) => {
          const title = (t.title || '').trim()
          const artist = (t.artist || '').trim()
          const hasBoth = title && artist && artist.toLowerCase() !== 'unknown'
          const confidence: 'high' | 'medium' | 'low' = hasBoth
            ? 'high'
            : (title || artist)
              ? 'medium'
              : 'low'
          return { title, artist, confidence }
        })
        .filter((t: CapturedTrack) => (t.title || '').length > 0 || (t.artist || '').length > 0)

      // Persist capture (fire and forget, but await so the user sees a clean state)
      fetch('/api/crate-captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          source: 'other',
          tracks: normalised,
          raw_response: { raw_text: data.raw_text || null },
        }),
      }).catch(() => {})

      if (normalised.length === 0) {
        setMode('crate_empty')
        return
      }

      setCrateTracks(normalised)
      setMode('crate_review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read image')
      setMode('crate_error')
    }
  }

  async function enrichTrack(index: number) {
    const t = crateTracks[index]
    if (!t || t.spotifyEnriched) return
    if (!t.title && !t.artist) return
    try {
      const res = await fetch('/api/spotify/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist: t.artist || 'Unknown', title: t.title || '' }),
      })
      const data = await res.json()
      setCrateTracks(prev => prev.map((row, i) => i === index ? {
        ...row,
        spotifyEnriched: true,
        spotifyFound: !!data.found,
        spotify_id: data.spotify_id,
        album_art: data.album_art || null,
        preview_url: data.preview_url || null,
        bpm: data.bpm ?? null,
        key: data.key ?? null,
        // pull Spotify's cleaner metadata in if we got it
        title: data.found ? (data.title || row.title) : row.title,
        artist: data.found ? (data.artist || row.artist) : row.artist,
      } : row))
    } catch {
      setCrateTracks(prev => prev.map((row, i) => i === index ? { ...row, spotifyEnriched: true, spotifyFound: false } : row))
    }
  }

  function togglePreview(url: string | null | undefined) {
    if (!url) return
    if (previewAudio) {
      previewAudio.pause()
      setPreviewAudio(null)
      return
    }
    const audio = new Audio(url)
    audio.play().catch(() => {})
    audio.onended = () => setPreviewAudio(null)
    setPreviewAudio(audio)
  }

  async function saveTrack(index: number) {
    const t = crateTracks[index]
    if (!t || t.saved || t.saving) return
    setCrateTracks(prev => prev.map((row, i) => i === index ? { ...row, saving: true } : row))
    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: [{
            title: t.title || '',
            artist: t.artist || '',
            bpm: t.bpm || 0,
            key: t.key || '',
            album_art: t.album_art || null,
            source: 'crate_capture',
            discovered_via: 'crate_capture',
          }],
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Save failed')
      setCrateTracks(prev => prev.map((row, i) => i === index ? { ...row, saved: true, saving: false } : row))
    } catch {
      setCrateTracks(prev => prev.map((row, i) => i === index ? { ...row, saving: false } : row))
    }
  }

  function resetCrate() {
    if (previewAudio) { previewAudio.pause() }
    setPreviewAudio(null)
    setCrateImageUrl(null)
    setCrateLocalPreview(null)
    setCrateTracks([])
    setError('')
    setMode('choose')
  }

  // ----- RECEIPT -----
  function pickReceipt() {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.capture = 'environment'
    inp.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) handleReceipt(f)
    }
    inp.click()
  }

  async function handleReceipt(file: File) {
    setMode('receipt_parsing')
    setError('')
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/expenses/scan-receipt', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success || !data.extracted) throw new Error(data.error || 'Could not read receipt')
      setReceipt(data.extracted as ReceiptExtracted)
      setMode('receipt_review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read receipt')
      setMode('receipt_error')
    }
  }

  async function saveReceipt() {
    if (!receipt) return
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: receipt.date || new Date().toISOString().split('T')[0],
          description: receipt.description || '',
          category: receipt.category || 'Other',
          amount: receipt.amount || 0,
          currency: receipt.currency || 'GBP',
          notes: receipt.notes || '',
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Save failed')
      setMode('receipt_saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setMode('receipt_error')
    }
  }

  function resetReceipt() {
    setReceipt(null)
    setError('')
    setMode('choose')
  }

  // ----- UI -----
  return (
    <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 'calc(20px + env(safe-area-inset-top)) 20px 0', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', color: COLOR.text, textTransform: 'uppercase' }}>
          SCAN
        </div>
      </div>

      {mode === 'choose' && (
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TileRow>
            <Tile
              label="CRATE CAPTURE"
              sub="VINYL · CDJ · TRACKLIST · SCREENSHOT"
              onPress={pickCrate}
              variant="red"
            />
            <Tile
              label="RECEIPT"
              sub="SNAP & SAVE AN EXPENSE"
              onPress={pickReceipt}
              variant="black"
            />
          </TileRow>
          {error && <ErrorBanner text={error} />}
        </div>
      )}

      {(mode === 'crate_uploading' || mode === 'crate_reading') && (
        <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {crateLocalPreview && (
            <div style={{
              width: 120, height: 120, overflow: 'hidden',
              border: `1px solid ${COLOR.border}`, background: COLOR.panel,
            }}>
              <img src={crateLocalPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: COLOR.red, textTransform: 'uppercase' }}>
            {mode === 'crate_uploading' ? 'UPLOADING' : 'READING'}
          </div>
        </div>
      )}

      {mode === 'crate_empty' && (
        <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {crateLocalPreview && (
            <div style={{ width: 120, height: 120, overflow: 'hidden', border: `1px solid ${COLOR.border}`, background: COLOR.panel }}>
              <img src={crateLocalPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ fontSize: 13, color: COLOR.dim, lineHeight: 1.5, maxWidth: 280 }}>
            No tracks read. Try again with better lighting.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
            <SolidButton onPress={() => { resetCrate(); pickCrate() }}>RETRY</SolidButton>
            <GhostButton onPress={resetCrate}>BACK</GhostButton>
          </div>
        </div>
      )}

      {mode === 'crate_review' && (
        <div style={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            {crateLocalPreview && (
              <div style={{ width: 72, height: 72, flexShrink: 0, overflow: 'hidden', border: `1px solid ${COLOR.border}`, background: COLOR.panel }}>
                <img src={crateLocalPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', color: COLOR.dimmer, textTransform: 'uppercase' }}>
                CAPTURED
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em', color: COLOR.text, marginTop: 4 }}>
                {crateTracks.length} TRACK{crateTracks.length === 1 ? '' : 'S'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: COLOR.border, marginBottom: 16 }}>
            {crateTracks.map((t, i) => (
              <TrackRow
                key={i}
                track={t}
                onTap={() => enrichTrack(i)}
                onPreview={() => togglePreview(t.preview_url)}
                onSave={() => saveTrack(i)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <GhostButton onPress={resetCrate}>DONE</GhostButton>
          </div>
        </div>
      )}

      {mode === 'crate_error' && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: COLOR.dim, marginBottom: 24 }}>{error || 'Something went wrong'}</div>
          <GhostButton onPress={resetCrate}>BACK</GhostButton>
        </div>
      )}

      {mode === 'receipt_parsing' && (
        <div style={{ padding: '80px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: COLOR.red, textTransform: 'uppercase' }}>
            READING RECEIPT
          </div>
        </div>
      )}

      {mode === 'receipt_review' && receipt && (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.border}`, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', color: COLOR.red, textTransform: 'uppercase', marginBottom: 14 }}>
              CONFIRM
            </div>
            <ReceiptField label="VENDOR" value={receipt.description} onChange={v => setReceipt(r => r ? { ...r, description: v } : r)} />
            <div style={{ marginTop: 14 }}>
              <FieldLabel>AMOUNT</FieldLabel>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: COLOR.text }}>
                <BlurredAmount>
                  {(receipt.amount ?? 0).toFixed(2)} {receipt.currency || 'GBP'}
                </BlurredAmount>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <FieldLabel>CATEGORY</FieldLabel>
              <select
                value={receipt.category}
                onChange={e => setReceipt(r => r ? { ...r, category: e.target.value } : r)}
                style={{
                  width: '100%', background: COLOR.bg, border: `1px solid ${COLOR.border}`,
                  color: COLOR.text, fontFamily: FONT, fontSize: 13, padding: '10px 12px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <ReceiptField label="DATE" value={receipt.date || ''} onChange={v => setReceipt(r => r ? { ...r, date: v } : r)} placeholder="YYYY-MM-DD" mt={14} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SolidButton onPress={saveReceipt}>SAVE</SolidButton>
            <GhostButton onPress={resetReceipt}>CANCEL</GhostButton>
          </div>
        </div>
      )}

      {mode === 'receipt_saved' && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.text, marginBottom: 6 }}>SAVED</div>
          <div style={{ fontSize: 11, color: COLOR.dimmer, letterSpacing: '0.14em' }}>Expense added</div>
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center' }}>
            <GhostButton onPress={resetReceipt}>DONE</GhostButton>
          </div>
        </div>
      )}

      {mode === 'receipt_error' && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: COLOR.dim, marginBottom: 24 }}>{error || 'Something went wrong'}</div>
          <GhostButton onPress={resetReceipt}>BACK</GhostButton>
        </div>
      )}
    </div>
  )
}

// ----- Tile row (side-by-side, stacks under 360px) -----
function TileRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {children}
    </div>
  )
}

function Tile({ label, sub, onPress, variant }: { label: string; sub: string; onPress: () => void; variant: 'red' | 'black' }) {
  const red = variant === 'red'
  return (
    <button
      onClick={onPress}
      style={{
        width: '100%',
        minHeight: 140,
        background: red ? COLOR.red : COLOR.bg,
        color: red ? '#050505' : COLOR.text,
        border: red ? 'none' : `1px solid ${COLOR.border}`,
        padding: '22px 18px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start',
        cursor: 'pointer', fontFamily: FONT,
        WebkitTapHighlightColor: 'transparent',
        textAlign: 'left',
      }}
    >
      <div style={{
        fontSize: 24, fontWeight: 800, letterSpacing: '-0.035em',
        textTransform: 'uppercase', lineHeight: 1, color: 'inherit',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase', opacity: red ? 0.75 : 0.6,
        color: 'inherit',
      }}>
        {sub}
      </div>
    </button>
  )
}

// ----- Track row -----
function TrackRow({ track, onTap, onPreview, onSave }: {
  track: CapturedTrack
  onTap: () => void
  onPreview: () => void
  onSave: () => void
}) {
  const dotColor = track.confidence === 'high' ? COLOR.green
    : track.confidence === 'medium' ? COLOR.amber
    : COLOR.dimmest

  return (
    <div style={{ background: COLOR.panel, padding: '14px 14px' }}>
      <div
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        {track.album_art ? (
          <img src={track.album_art} alt="" style={{ width: 44, height: 44, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 44, height: 44, flexShrink: 0,
            background: COLOR.bg, border: `1px solid ${COLOR.borderDim}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'block' }} />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: COLOR.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track.title || 'Untitled'}
          </div>
          <div style={{
            fontSize: 11, color: COLOR.dim, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track.artist || 'Unknown'}
            {track.bpm ? ` · ${track.bpm} BPM` : ''}
            {track.key ? ` · ${track.key}` : ''}
          </div>
        </div>
        {track.album_art && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'block', flexShrink: 0 }} />
        )}
      </div>

      {(track.spotifyEnriched || track.saved) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {track.preview_url && (
            <button
              onClick={onPreview}
              style={{
                flex: 1,
                background: 'transparent', color: COLOR.text,
                border: `1px solid ${COLOR.border}`,
                padding: '9px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', cursor: 'pointer', fontFamily: FONT,
              }}
            >
              PREVIEW
            </button>
          )}
          <button
            onClick={onSave}
            disabled={track.saved || track.saving}
            style={{
              flex: 1,
              background: track.saved ? COLOR.bg : COLOR.red,
              color: track.saved ? COLOR.dim : '#050505',
              border: track.saved ? `1px solid ${COLOR.border}` : 'none',
              padding: '9px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase',
              cursor: track.saved || track.saving ? 'default' : 'pointer',
              fontFamily: FONT,
              opacity: track.saving ? 0.6 : 1,
            }}
          >
            {track.saved ? 'SAVED' : track.saving ? 'SAVING' : 'SAVE'}
          </button>
        </div>
      )}
    </div>
  )
}

// ----- Small UI primitives -----
function SolidButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onPress} style={{
      background: COLOR.red, color: '#050505', border: 'none',
      padding: '16px', fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
      textTransform: 'uppercase', cursor: 'pointer', fontFamily: FONT,
    }}>
      {children}
    </button>
  )
}

function GhostButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onPress} style={{
      background: 'transparent', border: `1px solid ${COLOR.border}`, color: COLOR.dim,
      padding: '14px 28px', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
      textTransform: 'uppercase', cursor: 'pointer', fontFamily: FONT,
    }}>
      {children}
    </button>
  )
}

function ReceiptField({ label, value, onChange, placeholder, mt }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mt?: number }) {
  return (
    <div style={{ marginTop: mt }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: COLOR.bg, border: `1px solid ${COLOR.border}`,
          color: COLOR.text, fontFamily: FONT, fontSize: 13, padding: '10px 12px',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.dimmer, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(255,42,26,0.08)',
      border: `1px solid ${COLOR.red}50`,
      fontSize: 12, color: COLOR.red,
    }}>
      {text}
    </div>
  )
}
