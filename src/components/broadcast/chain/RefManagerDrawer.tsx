'use client'

import { useEffect, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { supabase } from '@/lib/supabaseBrowser'
import type { VoiceRef, VoiceRefProfile } from './types'

interface ArtistProfile {
  id: string
  // Real columns on artist_profiles are `name` + `handle` (not artist_name /
  // instagram_handle — that mistake shipped across the repo and silently
  // broke every ref lookup).
  name: string | null
  handle?: string | null
  biography?: string | null
  style_rules?: string | null
  chips?: string[] | null
  lowercase_pct?: number | null
  short_caption_pct?: number | null
  no_hashtags_pct?: number | null
  brand_positioning?: string | null
  content_strategy_notes?: string | null
  visual_aesthetic?: VoiceRefProfile['visual_aesthetic']
  content_performance?: VoiceRefProfile['content_performance']
}

interface Props {
  open: boolean
  refs: VoiceRef[]
  onClose: () => void
  onChange: (refs: VoiceRef[]) => void
}

/**
 * Drawer for adding/removing reference artists + adjusting their weight.
 * Writes through to user_voice_refs on every change; parent component gets the
 * new list via onChange and immediately re-runs caption gen with new weights.
 */
export function RefManagerDrawer({ open, refs, onClose, onChange }: Props) {
  const [available, setAvailable] = useState<ArtistProfile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      setUserId(user?.id ?? null)

      // Load the FULL profile payload so adding a ref immediately carries
      // its deep-dive data (style_rules, visual_aesthetic, chips, perf
      // metrics). Without these, newly-added refs write fortune cookies
      // until the user reloads the page and the parent re-hydrates.
      const { data } = await supabase
        .from('artist_profiles')
        .select('id, name, handle, biography, style_rules, chips, lowercase_pct, short_caption_pct, no_hashtags_pct, brand_positioning, content_strategy_notes, visual_aesthetic, content_performance')
        .order('name', { ascending: true })
        .limit(100)

      if (!cancelled && data) setAvailable(data as ArtistProfile[])
    })()

    return () => { cancelled = true }
  }, [open])

  async function persist(next: VoiceRef[]) {
    onChange(next)
    if (!userId) return
    setBusy(true)
    try {
      // Wipe & rewrite — small list, simplest correct approach
      await supabase.from('user_voice_refs').delete().eq('user_id', userId)
      if (next.length) {
        const rows = next.map((r, i) => ({
          user_id: userId,
          artist_profile_id: r.kind === 'artist' ? r.artist_profile_id : null,
          self_sample_text: r.kind === 'self' ? 'NM' : null,
          display_name: r.name,
          weight: r.weight,
          display_order: i,
        }))
        await supabase.from('user_voice_refs').insert(rows)
      }
    } finally {
      setBusy(false)
    }
  }

  function updateWeight(id: string, weight: number) {
    persist(refs.map(r => r.id === id ? { ...r, weight } : r))
  }

  function removeRef(id: string) {
    if (!window.confirm('Remove this reference from your voice?')) return
    persist(refs.filter(r => r.id !== id))
  }

  function addArtistRef(a: ArtistProfile) {
    if (refs.some(r => r.artist_profile_id === a.id)) return
    const name = a.name || a.handle || 'Unknown'
    // Snapshot the deep-dive columns onto the ref so caption gen can read
    // them immediately without a second round trip.
    const profile: VoiceRefProfile = {
      handle: a.handle ?? null,
      biography: a.biography ?? null,
      style_rules: a.style_rules ?? null,
      chips: a.chips ?? null,
      lowercase_pct: a.lowercase_pct ?? null,
      short_caption_pct: a.short_caption_pct ?? null,
      no_hashtags_pct: a.no_hashtags_pct ?? null,
      brand_positioning: a.brand_positioning ?? null,
      content_strategy_notes: a.content_strategy_notes ?? null,
      visual_aesthetic: a.visual_aesthetic ?? null,
      content_performance: a.content_performance ?? null,
    }
    persist([
      ...refs,
      {
        id: `artist-${a.id}`,
        name,
        weight: 50,
        kind: 'artist',
        artist_profile_id: a.id,
        profile,
      },
    ])
  }

  if (!open) return null

  const pinnedIds = new Set(refs.map(r => r.artist_profile_id).filter(Boolean))
  const addable = available.filter(a => !pinnedIds.has(a.id))

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 80,
        }}
      />
      {/* drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: '96vw',
          background: BRT.ticket,
          borderLeft: `1px solid ${BRT.red}`,
          zIndex: 81,
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          gap: 14,
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
              ◉ Voice references
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 6, color: BRT.ink }}>
              Who you blend with
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9a9a9a',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#9a9a9a' }}>
          Captions are written blending these voices by weight. Higher weight = stronger influence. You stay locked at 100 by default.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {refs.map(r => (
            <div
              key={r.id}
              style={{
                padding: 12,
                background: BRT.ticketLo,
                border: `1px solid ${BRT.borderBright}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRT.ink }}>
                  {r.kind === 'self' ? 'You · NM' : r.name}
                </div>
                {r.kind !== 'self' && (
                  <button
                    onClick={() => removeRef(r.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9a9a9a',
                      fontSize: 10,
                      letterSpacing: '0.22em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    remove
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={r.weight}
                  onChange={(e) => updateWeight(r.id, Number(e.target.value))}
                  style={{ flex: 1, accentColor: BRT.red }}
                />
                <div style={{ fontSize: 11, letterSpacing: '0.22em', color: BRT.red, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
                  {r.weight}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            letterSpacing: '0.28em',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          ◉ Add reference
        </div>
        {addable.length === 0 && (
          <div style={{ fontSize: 12, color: BRT.dimmest }}>
            All available artist profiles are already pinned.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {addable.map(a => (
            <button
              key={a.id}
              onClick={() => addArtistRef(a)}
              disabled={busy}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: `1px solid ${BRT.borderBright}`,
                color: BRT.ink,
                fontSize: 11,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + {a.name || a.handle}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
