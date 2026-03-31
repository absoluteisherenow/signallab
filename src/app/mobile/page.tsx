'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
}

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  scheduled_at: string
  status: string
}

interface DJSet {
  id: string
  title: string
  tracks: unknown[]
}

type CopyState = 'idle' | 'copied'

function ActionCard({
  label,
  sub,
  value,
  onCopy,
  href,
  copyState,
  empty,
}: {
  label: string
  sub?: string
  value?: string
  onCopy?: () => void
  href?: string
  copyState?: CopyState
  empty?: string
}) {
  const inner = (
    <div style={{
      background: '#0e0d0b',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 2,
      padding: '20px 20px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minHeight: 100,
      cursor: href || onCopy ? 'pointer' : 'default',
      WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#c9a96e',
            marginBottom: 6,
            fontFamily: "'DM Mono', monospace",
          }}>
            {label}
          </div>
          {sub && (
            <div style={{ fontSize: 13, color: '#f0ebe2', fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>
              {sub}
            </div>
          )}
        </div>
        {onCopy && (
          <button
            onClick={e => { e.preventDefault(); onCopy() }}
            style={{
              background: copyState === 'copied' ? 'rgba(61,107,74,0.3)' : 'rgba(201,169,110,0.12)',
              border: '1px solid',
              borderColor: copyState === 'copied' ? '#3d6b4a' : 'rgba(201,169,110,0.25)',
              color: copyState === 'copied' ? '#3d6b4a' : '#c9a96e',
              fontSize: 11,
              fontFamily: "'DM Mono', monospace",
              padding: '6px 14px',
              borderRadius: 2,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {copyState === 'copied' ? 'Copied' : 'Copy'}
          </button>
        )}
        {href && !onCopy && (
          <span style={{ fontSize: 12, color: 'rgba(201,169,110,0.5)', fontFamily: "'DM Mono', monospace" }}>→</span>
        )}
      </div>
      {value && (
        <div style={{
          fontSize: 12,
          color: 'rgba(240,235,226,0.55)',
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1.6,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 10,
          wordBreak: 'break-word',
        }}>
          {value}
        </div>
      )}
      {!value && empty && (
        <div style={{
          fontSize: 11,
          color: 'rgba(240,235,226,0.2)',
          fontFamily: "'DM Mono', monospace",
          fontStyle: 'normal',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 10,
        }}>
          {empty}
        </div>
      )}
    </div>
  )

  if (href && !onCopy) {
    return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  }
  return inner
}

export default function MobilePage() {
  const [mounted, setMounted] = useState(false)
  const [nextGig, setNextGig] = useState<Gig | null>(null)
  const [nextPost, setNextPost] = useState<ScheduledPost | null>(null)
  const [activeSet, setActiveSet] = useState<DJSet | null>(null)
  const [copyCaptionState, setCopyCaptionState] = useState<CopyState>('idle')
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return

    // Load next upcoming gig
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('gigs')
      .select('id, title, venue, location, date, time')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setNextGig(data[0] as Gig) })

    // Load next scheduled post (pending or draft, closest to now)
    supabase
      .from('scheduled_posts')
      .select('id, platform, caption, scheduled_at, status')
      .in('status', ['pending', 'draft', 'scheduled'])
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setNextPost(data[0] as ScheduledPost) })

    // Load most recent DJ set (active or latest modified)
    supabase
      .from('dj_sets')
      .select('id, title, tracks')
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setActiveSet(data[0] as DJSet) })
  }, [mounted])

  function formatGigDate(dateStr: string): string {
    const d = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Tonight'
    if (diff === 1) return 'Tomorrow'
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  function formatPostDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  async function copyCaption() {
    if (!nextPost?.caption) return
    try {
      await navigator.clipboard.writeText(nextPost.caption)
      setCopyCaptionState('copied')
      setTimeout(() => setCopyCaptionState('idle'), 2200)
    } catch {
      // Clipboard not available — silently skip
    }
  }

  async function saveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      // Save as a notification/note — store as a log entry
      await supabase.from('notifications').insert({
        type: 'gig_note',
        title: 'Quick note',
        message: noteText.trim(),
        created_at: new Date().toISOString(),
        read: false,
        data: { source: 'mobile', gig_id: nextGig?.id || null },
      })
      setNoteText('')
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2200)
    } catch {
      // Silently fail — note is not critical
    } finally {
      setSavingNote(false)
    }
  }

  if (!mounted) return null

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      fontFamily: "'DM Mono', monospace",
      paddingBottom: 40,
    }}>

      {/* Header */}
      <div style={{
        padding: '28px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.06em',
            color: '#eae5dc',
            textTransform: 'uppercase',
          }}>
            Night Manoeuvres
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', color: '#c9a96e', textTransform: 'uppercase', marginTop: 4 }}>
            Artist OS
          </div>
        </div>
        <Link href="/dashboard" style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          color: 'rgba(240,235,226,0.3)',
          textDecoration: 'none',
          textTransform: 'uppercase',
        }}>
          Full view →
        </Link>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Tonight's gig */}
        <ActionCard
          label="Next show"
          sub={nextGig ? `${nextGig.venue}${nextGig.location ? ` · ${nextGig.location}` : ''}` : undefined}
          value={nextGig ? formatGigDate(nextGig.date) + (nextGig.time ? ` · ${nextGig.time}` : '') : undefined}
          href={nextGig ? `/gigs/${nextGig.id}` : '/gigs'}
          empty="No upcoming shows"
        />

        {/* Tonight's set */}
        <ActionCard
          label="Active set"
          sub={activeSet?.title || undefined}
          value={activeSet
            ? `${Array.isArray(activeSet.tracks) ? activeSet.tracks.length : 0} tracks`
            : undefined}
          href={activeSet ? '/setlab' : '/setlab'}
          empty="No sets built yet"
        />

        {/* Next caption */}
        <ActionCard
          label="Next post"
          sub={nextPost ? (nextPost.platform || 'Post') : undefined}
          value={nextPost ? `${nextPost.caption?.slice(0, 120)}${(nextPost.caption?.length ?? 0) > 120 ? '…' : ''}` : undefined}
          onCopy={nextPost ? copyCaption : undefined}
          copyState={copyCaptionState}
          empty="No posts scheduled"
        />

        {/* Quick note */}
        <div style={{
          background: '#0e0d0b',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 2,
          padding: '20px 20px 18px',
        }}>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#c9a96e',
            marginBottom: 12,
          }}>
            Quick note
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Log a moment, track note, or anything..."
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 2,
              color: '#f0ebe2',
              fontSize: 13,
              fontFamily: "'DM Mono', monospace",
              padding: '10px 12px',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={saveNote}
              disabled={savingNote || !noteText.trim()}
              style={{
                background: noteSaved ? 'rgba(61,107,74,0.3)' : 'rgba(201,169,110,0.12)',
                border: '1px solid',
                borderColor: noteSaved ? '#3d6b4a' : 'rgba(201,169,110,0.25)',
                color: noteSaved ? '#3d6b4a' : noteText.trim() ? '#c9a96e' : 'rgba(201,169,110,0.3)',
                fontSize: 11,
                fontFamily: "'DM Mono', monospace",
                padding: '8px 18px',
                borderRadius: 2,
                cursor: noteText.trim() && !savingNote ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {noteSaved ? 'Saved' : savingNote ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Nav shortcuts */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginTop: 4,
        }}>
          {[
            { label: 'Signal Lab', href: '/broadcast' },
            { label: 'Set Lab', href: '/setlab' },
            { label: 'SONIX Lab', href: '/sonix' },
            { label: 'Tour Lab', href: '/gigs' },
          ].map(({ label, href }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#0e0d0b',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 2,
                padding: '14px 16px',
                fontSize: 11,
                color: 'rgba(240,235,226,0.45)',
                fontFamily: "'DM Mono', monospace",
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {label}
                <span style={{ color: 'rgba(201,169,110,0.4)' }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
