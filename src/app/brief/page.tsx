'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'

interface Todo {
  id: string
  title: string
  context: string | null
  source: 'manual' | 'auto_gig' | 'auto_invoice' | 'auto_post' | 'auto_ad' | 'auto_other'
  priority: 1 | 2 | 3
  due_date: string | null
  done_at: string | null
  created_at: string
}

const sourceLabel: Record<Todo['source'], string> = {
  manual: 'manual',
  auto_gig: 'gig',
  auto_invoice: 'invoice',
  auto_post: 'post',
  auto_ad: 'ad',
  auto_other: 'auto',
}

export default function BriefPage() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [authed, setAuthed] = useState<boolean | null>(null)

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  async function authedFetch(input: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers = new Headers(init?.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    headers.set('Content-Type', 'application/json')
    return fetch(input, { ...init, headers })
  }

  async function load() {
    setLoading(true)
    const res = await authedFetch('/api/brain/todos')
    if (res.ok) {
      const json = await res.json()
      setTodos(json.todos ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      if (data.session) load()
      else setLoading(false)
    })
  }, [])

  async function toggleDone(todo: Todo) {
    setTodos((xs) =>
      xs.map((t) => (t.id === todo.id ? { ...t, done_at: todo.done_at ? null : new Date().toISOString() } : t)),
    )
    await authedFetch('/api/brain/todos', {
      method: 'PATCH',
      body: JSON.stringify({ id: todo.id, done: !todo.done_at }),
    })
    load()
  }

  async function addTodo() {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await authedFetch('/api/brain/todos', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
    load()
  }

  async function removeTodo(id: string) {
    if (!confirm('Delete this to-do?')) return
    await authedFetch(`/api/brain/todos?id=${id}`, { method: 'DELETE' })
    load()
  }

  const open = todos.filter((t) => !t.done_at)
  const done = todos.filter((t) => t.done_at)

  if (authed === false) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-white/60 mb-4">Sign in to see your brief.</p>
          <a href="/login" className="underline">Go to login</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-widest text-white/50">NM — daily brief</div>
          <h1 className="text-3xl font-bold mt-1">{today}</h1>
        </header>

        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm uppercase tracking-wider text-white/60">
              To-dos · {open.length} open
            </h2>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              placeholder="Add a to-do…"
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button
              onClick={addTodo}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-white/90"
            >
              Add
            </button>
          </div>

          {loading ? (
            <div className="text-white/40 text-sm">Loading…</div>
          ) : open.length === 0 ? (
            <div className="text-white/40 text-sm py-4">Nothing open. Nice.</div>
          ) : (
            <ul className="space-y-2">
              {open.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded group"
                >
                  <button
                    aria-label="Mark done"
                    onClick={() => toggleDone(t)}
                    className="mt-0.5 h-5 w-5 rounded border border-white/30 hover:border-white hover:bg-white/10 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{t.title}</div>
                    {t.context && (
                      <div className="text-xs text-white/50 mt-0.5">{t.context}</div>
                    )}
                    <div className="flex gap-2 mt-1 text-[10px] uppercase tracking-wider text-white/40">
                      <span>{sourceLabel[t.source]}</span>
                      {t.due_date && <span>· due {t.due_date}</span>}
                      {t.priority === 1 && <span className="text-red-400">· high</span>}
                    </div>
                  </div>
                  {t.source === 'manual' && (
                    <button
                      onClick={() => removeTodo(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white text-xs"
                    >
                      delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {done.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm uppercase tracking-wider text-white/40 mb-3">
              Done today · {done.length}
            </h2>
            <ul className="space-y-1.5">
              {done.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm text-white/40">
                  <button
                    aria-label="Unmark"
                    onClick={() => toggleDone(t)}
                    className="h-4 w-4 rounded border border-white/20 bg-white/10 flex items-center justify-center text-[10px]"
                  >
                    ✓
                  </button>
                  <span className="line-through">{t.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
