'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Track {
  id: string
  title: string
  artist: string
}

export default function GigDebriefPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [gig, setGig] = useState<any>(null)
  const [setTracks, setSetTracks] = useState<Track[]>([])
  const [rating, setRating] = useState(0)
  const [standoutIds, setStandoutIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [caption, setCaption] = useState('')
  const [linkedSetId, setLinkedSetId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: gigData } = await supabase
        .from('gigs')
        .select('*')
        .eq('id', params.id)
        .single()
      setGig(gigData)

      // Find linked set tracks
      const { data: linkedSet } = await supabase
        .from('dj_sets')
        .select('id')
        .eq('gig_id', params.id)
        .limit(1)
        .single()

      if (linkedSet) {
        const { data: tracks } = await supabase
          .from('set_tracks')
          .select('dj_tracks(id, title, artist)')
          .eq('set_id', linkedSet.id)
        if (tracks) {
          setSetTracks(tracks.flatMap((t: any) => t.dj_tracks ? [t.dj_tracks] : []))
        }
      }
    }
    load()
  }, [params.id])

  function toggleTrack(id: string) {
    setStandoutIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/gigs/${params.id}/debrief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, notes, standout_track_ids: standoutIds }),
      })
      const data = await res.json()
      if (data.caption) setCaption(data.caption)
      if (data.set_id) setLinkedSetId(data.set_id)
      setDone(true)
    } catch {
      // fail silently
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: '#070706', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace' }}>
        <div style={{ maxWidth: 480, width: '100%', padding: '40px 24px' }}>
          <div style={{ color: '#c9a96e', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 24 }}>Debrief saved</div>
          <div style={{ fontSize: 22, color: '#f0ebe2', marginBottom: 8 }}>{'◆'.repeat(rating)}{'◇'.repeat(5 - rating)}</div>
          {caption && (
            <div style={{ background: '#0e0e0c', border: '1px solid #2a2a28', padding: 16, marginTop: 24, marginBottom: 24 }}>
              <div style={{ color: '#8a8780', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>Caption draft saved to Broadcast</div>
              <div style={{ color: '#f0ebe2', fontSize: 14 }}>{caption}</div>
            </div>
          )}
          <button
            onClick={() => router.push('/broadcast')}
            style={{ background: '#c9a96e', color: '#070706', border: 'none', padding: '12px 24px', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: 12 }}
          >
            Open Broadcast →
          </button>
          {linkedSetId && (
            <button
              onClick={() => router.push('/setlab')}
              style={{ background: 'transparent', color: '#c9a96e', border: '1px solid #c9a96e', padding: '12px 24px', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: 12 }}
            >
              View in Set Lab →
            </button>
          )}
          <button
            onClick={() => router.push('/gigs')}
            style={{ background: 'transparent', color: '#8a8780', border: '1px solid #2a2a28', padding: '12px 24px', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}
          >
            Back to gigs
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#070706', minHeight: '100vh', fontFamily: 'DM Mono, monospace', padding: '40px 24px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ color: '#c9a96e', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 8 }}>Post-gig debrief</div>
      <div style={{ fontSize: 20, color: '#f0ebe2', marginBottom: 4 }}>{gig?.venue || '—'}</div>
      <div style={{ color: '#8a8780', fontSize: 12, marginBottom: 40 }}>
        {gig?.date ? new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ color: '#8a8780', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>How did it go?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 28, color: n <= rating ? '#c9a96e' : '#3a3a38',
                padding: 0, fontFamily: 'DM Mono, monospace',
                transition: 'color 0.1s',
              }}
            >
              {n <= rating ? '◆' : '◇'}
            </button>
          ))}
        </div>
      </div>

      {/* Standout tracks */}
      {setTracks.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ color: '#8a8780', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Which tracks hit hardest?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {setTracks.map(t => (
              <button
                key={t.id}
                onClick={() => toggleTrack(t.id)}
                style={{
                  background: standoutIds.includes(t.id) ? '#c9a96e' : '#0e0e0c',
                  color: standoutIds.includes(t.id) ? '#070706' : '#f0ebe2',
                  border: `1px solid ${standoutIds.includes(t.id) ? '#c9a96e' : '#2a2a28'}`,
                  padding: '6px 12px', cursor: 'pointer',
                  fontFamily: 'DM Mono, monospace', fontSize: 11,
                  transition: 'all 0.1s',
                }}
              >
                {t.artist} — {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ color: '#8a8780', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Anything to remember?</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="crowd energy, sound issues, what worked..."
          rows={3}
          style={{
            width: '100%', background: '#0e0e0c', border: '1px solid #2a2a28',
            color: '#f0ebe2', fontFamily: 'DM Mono, monospace', fontSize: 13,
            padding: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        style={{
          background: rating === 0 ? '#1a1a18' : '#c9a96e',
          color: rating === 0 ? '#3a3a38' : '#070706',
          border: 'none', padding: '14px 28px', cursor: rating === 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          transition: 'all 0.15s',
        }}
      >
        {submitting ? 'Saving...' : 'Save debrief →'}
      </button>
    </div>
  )
}
