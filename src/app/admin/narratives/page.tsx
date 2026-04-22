'use client'

// Narrative threads admin. Threads are medium-horizon stories the artist is
// building across many posts — active rows inject into the brain's system
// prompt as a `do not contradict` block, and a soft_flag `threadConsistency`
// check catches literal watch-out hits post-generation.
//
// This page is the only way to CRUD threads today. All fields visible, all
// edits scoped to the authed user's own rows.

import { useEffect, useState } from 'react'

type ThreadStatus = 'active' | 'archived'

interface Thread {
  id: string
  slug: string
  title: string
  body: string
  non_negotiables: string[]
  watch_outs: string[]
  applies_to: string[]
  priority: number
  status: ThreadStatus
  mission_id: string | null
  created_at: string
  updated_at: string
}

const TASK_OPTIONS: string[] = [
  'caption.instagram',
  'caption.tiktok',
  'caption.threads',
  'release.announce',
  'release.rollout',
  'gig.content',
  'gig.advance',
  'gig.recap',
  'ad.creative',
  'ad.launch',
  'assistant.chat',
  'brief.weekly',
]

const box: React.CSSProperties = { border: '1px solid #1a1a1a', background: '#0a0a0a', padding: 16 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6a6a' }
const value: React.CSSProperties = { fontFamily: 'monospace', fontSize: 14, color: '#f2f2f2' }
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  border: '1px solid #1a1a1a',
  color: '#f2f2f2',
  fontFamily: 'monospace',
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
}
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical' }
const btn: React.CSSProperties = {
  background: '#ff2a1a',
  color: '#000',
  border: 0,
  padding: '10px 18px',
  fontFamily: 'monospace',
  fontSize: 12,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#6a6a6a',
  border: '1px solid #1a1a1a',
  padding: '8px 14px',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
const chipActive: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#f2f2f2',
  border: '1px solid #333',
  padding: '6px 10px',
  fontFamily: 'monospace',
  fontSize: 11,
  cursor: 'pointer',
}
const chipInactive: React.CSSProperties = { ...chipActive, background: 'transparent', color: '#6a6a6a' }

function emptyDraft(): Partial<Thread> {
  return {
    slug: '',
    title: '',
    body: '',
    non_negotiables: [],
    watch_outs: [],
    applies_to: ['caption.instagram', 'caption.threads', 'release.announce'],
    priority: 50,
    status: 'active',
  }
}

export default function NarrativesPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [error, setError] = useState<string>('')
  const [editing, setEditing] = useState<Partial<Thread> | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setError('')
    try {
      const res = await fetch('/api/admin/narratives', { credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `HTTP ${res.status}`)
        return
      }
      const body = await res.json()
      setThreads(body.threads || [])
    } catch (e: any) {
      setError(e?.message || 'load failed')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function save() {
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const isNew = !editing.id
      const res = await fetch('/api/admin/narratives', {
        method: isNew ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `HTTP ${res.status}`)
        return
      }
      setEditing(null)
      await load()
    } catch (e: any) {
      setError(e?.message || 'save failed')
    } finally {
      setSaving(false)
    }
  }

  async function archive(id: string) {
    if (!confirm('Archive this thread? It stops injecting into the brain.')) return
    const res = await fetch('/api/admin/narratives', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: 'archived' }),
    })
    if (res.ok) await load()
  }

  async function unarchive(id: string) {
    const res = await fetch('/api/admin/narratives', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: 'active' }),
    })
    if (res.ok) await load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this thread permanently? This cannot be undone.')) return
    const res = await fetch(`/api/admin/narratives?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (res.ok) await load()
  }

  function toggleTask(task: string) {
    if (!editing) return
    const current = editing.applies_to || []
    setEditing({
      ...editing,
      applies_to: current.includes(task) ? current.filter((t) => t !== task) : [...current, task],
    })
  }

  function lineArray(value: string): string[] {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const active = (threads || []).filter((t) => t.status === 'active')
  const archived = (threads || []).filter((t) => t.status === 'archived')

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', color: '#c0c0c0', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ ...label, color: '#ff2a1a', marginBottom: 8 }}>Signal Lab OS · narrative threads</div>
      <div style={{ fontSize: 14, color: '#6a6a6a', marginBottom: 24, maxWidth: 780 }}>
        Medium-horizon stories you are building across multiple posts / ads / releases. Active threads
        inject into the brain prompt as a <em>do not contradict</em> block. The <code>threadConsistency</code>{' '}
        check soft-flags any literal watch-out phrase found in generated output.
      </div>

      {error ? (
        <div style={{ background: '#2a0a0a', border: '1px solid #ff2a1a', color: '#ff8a7a', padding: 12, marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <button style={btn} onClick={() => setEditing(emptyDraft())}>+ New thread</button>
        <button style={btnGhost} onClick={load}>Refresh</button>
      </div>

      {editing ? (
        <div style={{ ...box, marginBottom: 24 }}>
          <div style={{ ...label, marginBottom: 12 }}>{editing.id ? 'Edit thread' : 'New thread'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Slug</div>
              <input
                style={inputStyle}
                placeholder="vespers_hybrid_rig"
                value={editing.slug || ''}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                disabled={!!editing.id}
              />
            </div>
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Priority (0-100)</div>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                value={editing.priority ?? 50}
                onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ ...label, marginBottom: 6 }}>Title</div>
            <input
              style={inputStyle}
              placeholder="Vespers rig is hand-built live"
              value={editing.title || ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ ...label, marginBottom: 6 }}>Body — what the brain reads</div>
            <textarea
              style={textareaStyle}
              placeholder="The Vespers set is a hybrid-live rig: 4xCDJ-3000 + V10 + Technics + OB-6 + Ableton Move. Every transition is played, not pre-rendered."
              value={editing.body || ''}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Non-negotiables (one per line)</div>
              <textarea
                style={textareaStyle}
                placeholder={'rig is CDJ + OB-6 + Move\nshow is fully live, no pre-rendered stems'}
                value={(editing.non_negotiables || []).join('\n')}
                onChange={(e) => setEditing({ ...editing, non_negotiables: lineArray(e.target.value) })}
              />
            </div>
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Watch-outs (literal phrases to catch — one per line)</div>
              <textarea
                style={textareaStyle}
                placeholder={'pre-recorded\nplaying off laptop\nDJ set'}
                value={(editing.watch_outs || []).join('\n')}
                onChange={(e) => setEditing({ ...editing, watch_outs: lineArray(e.target.value) })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ ...label, marginBottom: 6 }}>Applies to tasks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TASK_OPTIONS.map((task) => {
                const on = (editing.applies_to || []).includes(task)
                return (
                  <span key={task} style={on ? chipActive : chipInactive} onClick={() => toggleTask(task)}>
                    {task}
                  </span>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btn} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Create thread'}
            </button>
            <button style={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div style={{ ...label, marginTop: 8, marginBottom: 12 }}>
        Active threads · {active.length}
      </div>
      {threads === null ? (
        <div style={{ color: '#6a6a6a' }}>Loading…</div>
      ) : active.length === 0 ? (
        <div style={{ ...box, color: '#6a6a6a', fontSize: 13 }}>
          No active threads yet. Create one to start shaping the narrative the brain defends.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map((t) => (
            <ThreadRow
              key={t.id}
              t={t}
              onEdit={() => setEditing(t)}
              onArchive={() => archive(t.id)}
              onDelete={() => remove(t.id)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <>
          <div style={{ ...label, marginTop: 24, marginBottom: 12 }}>Archived · {archived.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {archived.map((t) => (
              <ThreadRow
                key={t.id}
                t={t}
                archived
                onEdit={() => setEditing(t)}
                onArchive={() => unarchive(t.id)}
                onDelete={() => remove(t.id)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function ThreadRow(props: {
  t: Thread
  archived?: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const { t } = props
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...value, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
          <div style={{ fontSize: 11, color: '#6a6a6a', marginBottom: 8 }}>
            {t.slug} · priority {t.priority} · {t.applies_to.length} task{t.applies_to.length === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 12, color: '#c0c0c0', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{t.body}</div>
          {t.non_negotiables.length ? (
            <div style={{ fontSize: 11, color: '#6a6a6a', marginBottom: 4 }}>
              non-negotiables: {t.non_negotiables.map((n) => `"${n}"`).join(', ')}
            </div>
          ) : null}
          {t.watch_outs.length ? (
            <div style={{ fontSize: 11, color: '#6a6a6a' }}>
              watch-outs: {t.watch_outs.map((w) => `"${w}"`).join(', ')}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button style={btnGhost} onClick={props.onEdit}>Edit</button>
          <button style={btnGhost} onClick={props.onArchive}>
            {props.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button style={{ ...btnGhost, color: '#ff8a7a', borderColor: '#3a1a1a' }} onClick={props.onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
