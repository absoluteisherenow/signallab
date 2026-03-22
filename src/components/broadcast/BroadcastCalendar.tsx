'use client'

import { useState, useEffect } from 'react'

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  format: string
  scheduled_at: string
  status: 'scheduled' | 'posted' | 'draft'
  gig_title?: string
  media_url?: string
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const PLATFORM_COLORS: Record<string, string> = {
  'Instagram': '#b08d57',
  'TikTok': '#3d6b4a',
  'Threads': '#6a7a9a',
  'X / Twitter': '#4a5a7a',
}

export function BroadcastCalendar() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [filterPlatform, setFilterPlatform] = useState('All')

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    setLoading(true)
    try {
      const res = await fetch('/api/schedule')
      const data = await res.json()
      if (data.success && data.posts.length > 0) {
        setPosts(data.posts)
      } else {
        // Fallback sample data
        setPosts([
          { id: '1', platform: 'Instagram', caption: 'pitch on a saturday. yeah', format: 'post', scheduled_at: getWeekDate(1, 22), status: 'scheduled' },
          { id: '2', platform: 'TikTok', caption: "crowd clip — didn't expect that reaction", format: 'reel', scheduled_at: getWeekDate(1, 20), status: 'scheduled' },
          { id: '3', platform: 'Instagram', caption: 'same airport. different country.', format: 'story', scheduled_at: getWeekDate(3, 9), status: 'draft' },
          { id: '4', platform: 'TikTok', caption: 'studio session clip', format: 'reel', scheduled_at: getWeekDate(4, 19), status: 'scheduled' },
          { id: '5', platform: 'Instagram', caption: 'still processing last night tbh', format: 'carousel', scheduled_at: getWeekDate(5, 12), status: 'posted' },
        ])
      }
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  function getWeekDate(dayOfWeek: number, hour: number) {
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - now.getDay() + 1)
    monday.setDate(monday.getDate() + dayOfWeek - 1)
    monday.setHours(hour, 0, 0, 0)
    return monday.toISOString()
  }

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1 + weekOffset * 7)

  function getDayDate(dayIndex: number) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dayIndex)
    return d
  }

  function getPostsForDay(dayIndex: number) {
    const dayDate = getDayDate(dayIndex)
    return posts.filter(p => {
      if (filterPlatform !== 'All' && p.platform !== filterPlatform) return false
      const postDate = new Date(p.scheduled_at)
      return postDate.toDateString() === dayDate.toDateString()
    })
  }

  function getPostTime(post: ScheduledPost) {
    const d = new Date(post.scheduled_at)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const totalScheduled = posts.filter(p => p.status === 'scheduled').length
  const totalPosted = posts.filter(p => p.status === 'posted').length

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#2e2c29',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Broadcast Lab — Calendar
          </div>
          <div style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.04em' }}>
            Week of <span style={{ fontStyle: 'italic', color: s.gold, fontFamily: 'Georgia, serif' }}>
              {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '11px', color: s.dim, textAlign: 'right', lineHeight: '2' }}>
            <div>{totalScheduled} scheduled</div>
            <div>{totalPosted} posted</div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '14px', padding: '8px 14px', cursor: 'pointer' }}>←</button>
            <button onClick={() => setWeekOffset(0)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer' }}>Today</button>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '14px', padding: '8px 14px', cursor: 'pointer' }}>→</button>
          </div>
        </div>
      </div>

      {/* PLATFORM FILTER */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {['All', 'Instagram', 'TikTok', 'Threads'].map(p => (
          <button key={p} onClick={() => setFilterPlatform(p)} style={{
            fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '6px 14px',
            background: filterPlatform === p ? s.panel : 'transparent',
            border: filterPlatform === p ? `1px solid ${PLATFORM_COLORS[p] || s.gold}` : `1px solid ${s.border}`,
            color: filterPlatform === p ? (PLATFORM_COLORS[p] || s.gold) : s.dimmer,
            cursor: 'pointer',
          }}>{p}</button>
        ))}
        <button onClick={() => window.location.href = '/broadcast'} style={{ marginLeft: 'auto', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 16px', background: 'transparent', border: `1px solid ${s.gold}40`, color: s.gold, cursor: 'pointer' }}>
          + Create post
        </button>
      </div>

      {/* CALENDAR GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '24px' }}>
        {DAYS.map((day, i) => {
          const date = getDayDate(i)
          const isToday = date.toDateString() === new Date().toDateString()
          const dayPosts = getPostsForDay(i)

          return (
            <div key={day} style={{ background: s.panel, border: `1px solid ${isToday ? s.gold + '60' : s.border}`, minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: isToday ? s.gold : s.dimmer, textTransform: 'uppercase' }}>{day}</div>
                <div style={{ fontSize: '12px', color: isToday ? s.gold : s.dim }}>{date.getDate()}</div>
              </div>
              <div style={{ flex: 1, padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {dayPosts.map(post => (
                  <div key={post.id} onClick={() => setSelectedPost(post)} style={{
                    background: '#1a1917', border: `1px solid ${PLATFORM_COLORS[post.platform] || s.border}30`,
                    borderLeft: `2px solid ${PLATFORM_COLORS[post.platform] || s.gold}`,
                    padding: '6px 8px', cursor: 'pointer', opacity: post.status === 'posted' ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: PLATFORM_COLORS[post.platform] || s.gold, textTransform: 'uppercase' }}>{post.platform.split(' ')[0]}</div>
                      <div style={{ fontSize: '8px', color: s.dimmer }}>{getPostTime(post)}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                      <div style={{ fontSize: '8px', color: s.dimmer, textTransform: 'uppercase' }}>{post.format}</div>
                      <div style={{ fontSize: '8px', color: post.status === 'posted' ? '#3d6b4a' : post.status === 'draft' ? s.dimmer : s.gold, textTransform: 'uppercase' }}>{post.status}</div>
                    </div>
                  </div>
                ))}
                <button onClick={() => window.location.href = '/broadcast'} style={{ background: 'transparent', border: `1px dashed ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '11px', padding: '6px', cursor: 'pointer', width: '100%', marginTop: 'auto' }}>+</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* SELECTED POST */}
      {selectedPost && (
        <div style={{ background: s.panel, border: `1px solid ${PLATFORM_COLORS[selectedPost.platform] || s.gold}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: PLATFORM_COLORS[selectedPost.platform] || s.gold, textTransform: 'uppercase', marginBottom: '8px' }}>
                {selectedPost.platform} · {selectedPost.format} · {getPostTime(selectedPost)}
              </div>
              <div style={{ fontSize: '15px', color: s.text, letterSpacing: '0.04em' }}>{selectedPost.caption}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => window.location.href = '/broadcast'} style={{ background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                Edit in Broadcast Lab
              </button>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
          {selectedPost.gig_title && (
            <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '8px' }}>Gig: {selectedPost.gig_title}</div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(14,13,11,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', color: s.dim }}>
          Loading posts...
        </div>
      )}
    </div>
  )
}
