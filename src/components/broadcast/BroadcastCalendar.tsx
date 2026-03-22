'use client'

import { useState } from 'react'

interface ScheduledPost {
  id: string
  day: number
  platform: string
  caption: string
  format: string
  time: string
  status: 'scheduled' | 'posted' | 'draft'
  media?: string
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const PLATFORMS = ['Instagram', 'TikTok', 'X / Twitter']
const PLATFORM_COLORS: Record<string, string> = {
  'Instagram': '#b08d57',
  'TikTok': '#3d6b4a',
  'X / Twitter': '#4a5a7a',
}

const SAMPLE_POSTS: ScheduledPost[] = [
  { id: '1', day: 1, platform: 'Instagram', caption: 'pitch on a saturday. yeah', format: 'post', time: '22:00', status: 'scheduled' },
  { id: '2', day: 1, platform: 'TikTok', caption: 'crowd clip — didn\'t expect that reaction', format: 'reel', time: '20:00', status: 'scheduled' },
  { id: '3', day: 3, platform: 'Instagram', caption: 'same airport. different country.', format: 'story', time: '09:00', status: 'draft' },
  { id: '4', day: 4, platform: 'TikTok', caption: 'studio session clip — no context needed', format: 'reel', time: '19:00', status: 'scheduled' },
  { id: '5', day: 5, platform: 'Instagram', caption: 'still processing last night tbh', format: 'carousel', time: '12:00', status: 'posted' },
  { id: '6', day: 6, platform: 'X / Twitter', caption: 'this track sounded completely different yesterday', format: 'post', time: '14:00', status: 'scheduled' },
]

export function BroadcastCalendar() {
  const [posts, setPosts] = useState<ScheduledPost[]>(SAMPLE_POSTS)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [filterPlatform, setFilterPlatform] = useState('All')
  const [weekOffset, setWeekOffset] = useState(0)

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1 + weekOffset * 7)

  const getDayDate = (dayIndex: number) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dayIndex)
    return d
  }

  const getPostsForDay = (dayIndex: number) => {
    return posts.filter(p => {
      if (filterPlatform !== 'All' && p.platform !== filterPlatform) return false
      return p.day === dayIndex
    })
  }

  const totalScheduled = posts.filter(p => p.status === 'scheduled').length
  const totalPosted = posts.filter(p => p.status === 'posted').length

  const s = {
    bg: '#070706',
    panel: '#0e0d0b',
    border: '#2e2c29',
    gold: '#b08d57',
    text: '#f0ebe2',
    textDim: '#8a8780',
    textDimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Broadcast Lab — Content Calendar
          </div>
          <div style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.04em' }}>
            Week of <span style={{ fontStyle: 'italic', color: s.gold, fontFamily: 'Georgia, serif' }}>
              {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: s.textDim, textAlign: 'right', lineHeight: '2' }}>
            <div>{totalScheduled} posts scheduled</div>
            <div>{totalPosted} posted this week</div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '12px', padding: '8px 14px', cursor: 'pointer' }}>←</button>
            <button onClick={() => setWeekOffset(0)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer' }}>Today</button>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '12px', padding: '8px 14px', cursor: 'pointer' }}>→</button>
          </div>
        </div>
      </div>

      {/* PLATFORM FILTER */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {['All', ...PLATFORMS].map(p => (
          <button key={p} onClick={() => setFilterPlatform(p)} style={{
            fontFamily: s.font,
            fontSize: '9px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            background: filterPlatform === p ? s.panel : 'transparent',
            border: filterPlatform === p ? `1px solid ${PLATFORM_COLORS[p] || s.gold}` : `1px solid ${s.border}`,
            color: filterPlatform === p ? (PLATFORM_COLORS[p] || s.gold) : s.textDimmer,
            cursor: 'pointer',
          }}>{p}</button>
        ))}
      </div>

      {/* CALENDAR GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '24px' }}>
        {DAYS.map((day, i) => {
          const date = getDayDate(i)
          const isToday = date.toDateString() === new Date().toDateString()
          const dayPosts = getPostsForDay(i)

          return (
            <div key={day} style={{
              background: s.panel,
              border: `1px solid ${isToday ? s.gold : s.border}`,
              minHeight: '160px',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Day header */}
              <div style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${s.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: isToday ? s.gold : s.textDimmer, textTransform: 'uppercase' }}>{day}</div>
                <div style={{ fontSize: '11px', color: isToday ? s.gold : s.textDim }}>{date.getDate()}</div>
              </div>

              {/* Posts */}
              <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {dayPosts.map(post => (
                  <div key={post.id} onClick={() => setSelectedPost(post)} style={{
                    background: '#1a1917',
                    border: `1px solid ${PLATFORM_COLORS[post.platform]}30`,
                    borderLeft: `2px solid ${PLATFORM_COLORS[post.platform]}`,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    opacity: post.status === 'posted' ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: PLATFORM_COLORS[post.platform], textTransform: 'uppercase' }}>{post.platform.split(' ')[0]}</div>
                      <div style={{ fontSize: '8px', color: s.textDimmer }}>{post.time}</div>
                    </div>
                    <div style={{ fontSize: '10px', color: s.textDim, lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                      <div style={{ fontSize: '8px', color: s.textDimmer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{post.format}</div>
                      <div style={{ fontSize: '8px', color: post.status === 'posted' ? '#3d6b4a' : post.status === 'draft' ? s.textDimmer : s.gold, textTransform: 'uppercase' }}>{post.status}</div>
                    </div>
                  </div>
                ))}

                {/* Add post button */}
                <button
                  onClick={() => window.location.href = '/broadcast'}
                  style={{
                    background: 'transparent',
                    border: `1px dashed ${s.border}`,
                    color: s.textDimmer,
                    fontFamily: s.font,
                    fontSize: '10px',
                    padding: '6px',
                    cursor: 'pointer',
                    width: '100%',
                    marginTop: 'auto',
                  }}>+</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* SELECTED POST DETAIL */}
      {selectedPost && (
        <div style={{ background: s.panel, border: `1px solid ${PLATFORM_COLORS[selectedPost.platform]}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: PLATFORM_COLORS[selectedPost.platform], textTransform: 'uppercase', marginBottom: '6px' }}>
                {selectedPost.platform} · {selectedPost.format} · {selectedPost.time}
              </div>
              <div style={{ fontSize: '16px', color: s.text, letterSpacing: '0.06em' }}>{selectedPost.caption}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => window.location.href = '/broadcast'} style={{ background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                Edit in Broadcast Lab
              </button>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {[
              { l: 'Status', v: selectedPost.status },
              { l: 'Format', v: selectedPost.format },
              { l: 'Platform', v: selectedPost.platform },
              { l: 'Time', v: selectedPost.time },
            ].map(f => (
              <div key={f.l}>
                <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>{f.l}</div>
                <div style={{ fontSize: '12px', color: s.textDim }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
