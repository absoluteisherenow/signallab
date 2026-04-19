'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'

interface Task {
  id: string
  title: string
  status: string
  priority: string | null
  notes: string | null
  due_at: string | null
  gig_id: string | null
  created_at: string
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low' | ''>('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/tasks')
    const d = await r.json()
    setTasks(d.tasks ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setBusy(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), priority: newPriority || null }),
    })
    setNewTitle('')
    setNewPriority('')
    setBusy(false)
    load()
  }

  async function toggle(t: Task) {
    const next = t.status === 'completed' ? 'open' : 'completed'
    await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    load()
  }

  async function remove(t: Task) {
    if (!window.confirm(`Delete "${t.title}"?`)) return
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })
    load()
  }

  const open = tasks.filter(t => t.status !== 'completed')
  const done = tasks.filter(t => t.status === 'completed')

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>
      <PageHeader
        section="To Do"
        sectionColor="var(--gold)"
        title="Tasks"
        subtitle={`${open.length} open · ${done.length} completed`}
      />

      <div style={{ padding: '32px 48px', maxWidth: 840 }}>
        <form onSubmit={create} style={{ display: 'flex', gap: 8, marginBottom: 32, borderBottom: '1px solid var(--border-dim)', paddingBottom: 16 }}>
          <input
            type="text"
            placeholder="Add a task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 15, padding: '8px 4px',
              fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as 'high' | 'medium' | 'low' | '')}
            style={{
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '6px 10px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
            }}
          >
            <option value="">Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            type="submit"
            disabled={busy || !newTitle.trim()}
            style={{
              background: 'var(--gold)', color: '#050505', border: 'none',
              padding: '6px 20px', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !newTitle.trim() ? 0.4 : 1,
            }}
          >
            Add
          </button>
        </form>

        {loading ? (
          <div style={{ color: 'var(--text-dimmest)', fontSize: 12 }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginBottom: 12 }}>
              Open · {open.length}
            </div>
            {open.length === 0 && (
              <div style={{ color: 'var(--text-dimmest)', fontSize: 12, marginBottom: 24 }}>Nothing open. Nice.</div>
            )}
            {open.map(t => (
              <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => remove(t)} />
            ))}

            {done.length > 0 && (
              <>
                <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>
                  Completed · {done.length}
                </div>
                {done.map(t => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => remove(t)} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const priColor = task.priority === 'high' ? 'var(--gold)' : task.priority === 'medium' ? 'var(--text-dimmer)' : 'var(--border)'
  const done = task.status === 'completed'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--border-dim)',
      opacity: done ? 0.5 : 1,
    }}>
      <button
        onClick={onToggle}
        aria-label={done ? 'Mark open' : 'Mark complete'}
        style={{
          width: 16, height: 16, flexShrink: 0,
          border: `1px solid ${done ? 'var(--gold)' : 'var(--border)'}`,
          background: done ? 'var(--gold)' : 'transparent',
          cursor: 'pointer', padding: 0,
        }}
      />
      <div style={{ width: 3, height: 16, background: priColor, flexShrink: 0 }} />
      <div style={{
        flex: 1, fontSize: 14, color: 'var(--text)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {task.title}
      </div>
      {task.priority && (
        <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700 }}>
          {task.priority}
        </span>
      )}
      <button
        onClick={onDelete}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-dimmest)',
          cursor: 'pointer', fontSize: 14, padding: '0 6px',
        }}
        aria-label="Delete task"
      >
        ×
      </button>
    </div>
  )
}
