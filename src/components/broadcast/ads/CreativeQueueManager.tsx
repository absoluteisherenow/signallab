'use client'

import { useCallback, useEffect, useState } from 'react'

type QueueRow = {
  id: string
  intent: 'growth_stage_1' | 'growth_stage_2'
  ig_post_id: string
  ig_permalink: string | null
  ig_caption_excerpt: string | null
  position: number
  status: 'queued' | 'used' | 'skipped' | 'archived'
  approved_at?: string | null
  used_at: string | null
  used_for_campaign_id: string | null
  created_at: string
}

const S = {
  red: '#ff2a1a',
  panel: '#0e0e0e',
  border: 'rgba(255,255,255,0.08)',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  mute: '#5a5a5a',
}

const panel: React.CSSProperties = {
  background: S.panel,
  border: `1px solid ${S.border}`,
  padding: '20px 24px',
}

const btn = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  padding: '8px 12px',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 700,
  cursor: 'pointer',
  border: '1px solid',
  borderColor: variant === 'primary' ? S.red : variant === 'danger' ? 'rgba(255,42,26,0.4)' : S.border,
  background: variant === 'primary' ? S.red : 'transparent',
  color: variant === 'primary' ? '#050505' : variant === 'danger' ? S.red : S.dim,
})

const IG_URL_RE = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/

function extractIgShortcode(input: string): string | null {
  const trimmed = input.trim()
  const m = trimmed.match(IG_URL_RE)
  if (m) return m[1]
  // Treat raw shortcodes (no slashes/spaces) as already extracted
  if (/^[A-Za-z0-9_-]{5,}$/.test(trimmed)) return trimmed
  return null
}

/**
 * CreativeQueueManager — add/approve/archive IG posts that the auto-rotate
 * action will swap to when fatigue fires. Approve gates eligibility (the
 * apply-rule swap_creative action only picks `approved_at IS NOT NULL` rows).
 */
export default function CreativeQueueManager({
  intent = 'growth_stage_1',
  onChange,
}: {
  intent?: 'growth_stage_1' | 'growth_stage_2'
  onChange?: () => void
}) {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ads/creative-queue?intent=${intent}`)
      const body = await res.json().catch(() => ({}))
      if (res.ok) setRows(body.queue ?? [])
    } finally {
      setLoading(false)
    }
  }, [intent])

  useEffect(() => {
    load()
  }, [load])

  const add = useCallback(async () => {
    setErr(null)
    const shortcode = extractIgShortcode(input)
    if (!shortcode) {
      setErr('Paste an instagram.com/p/... or /reel/... URL, or the shortcode.')
      return
    }
    setAdding(true)
    try {
      // Resolve IG shortcode → post id is non-trivial without the IG Graph API,
      // so accept the shortcode as ig_post_id directly. The Meta API accepts both
      // numeric IDs and shortcodes for source_instagram_media_id.
      const res = await fetch('/api/ads/creative-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          ig_post_id: shortcode,
          ig_permalink: input.startsWith('http') ? input.trim() : `https://www.instagram.com/p/${shortcode}/`,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body?.error ?? `Add failed (${res.status})`)
        return
      }
      setInput('')
      await load()
      onChange?.()
    } finally {
      setAdding(false)
    }
  }, [input, intent, load, onChange])

  const patch = useCallback(
    async (id: string, action: 'approve' | 'unapprove' | 'archive' | 'restore') => {
      setBusyId(id)
      try {
        const res = await fetch('/api/ads/creative-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action }),
        })
        if (res.ok) {
          await load()
          onChange?.()
        } else {
          const body = await res.json().catch(() => ({}))
          alert(`Failed: ${body?.error ?? res.statusText}`)
        }
      } finally {
        setBusyId(null)
      }
    },
    [load, onChange]
  )

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this queued creative?')) return
      setBusyId(id)
      try {
        const res = await fetch(`/api/ads/creative-queue?id=${id}`, { method: 'DELETE' })
        if (res.ok) {
          await load()
          onChange?.()
        }
      } finally {
        setBusyId(null)
      }
    },
    [load, onChange]
  )

  const queued = rows.filter(r => r.status === 'queued')
  const approvedQueued = queued.filter(r => r.approved_at)
  const used = rows.filter(r => r.status === 'used')

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: S.dimmer, fontWeight: 700 }}>
          Auto-rotate queue · {intent === 'growth_stage_1' ? 'Stage 1' : 'Stage 2'}
        </div>
        <div style={{ fontSize: 11, color: approvedQueued.length >= 2 ? S.dim : S.red, fontWeight: 700 }}>
          {approvedQueued.length} approved · {queued.length - approvedQueued.length} draft
        </div>
      </div>
      <div style={{ fontSize: 12, color: S.dimmer, marginBottom: 16 }}>
        When fatigue fires (frequency &gt; 3 or 10+ days same creative), the next approved post here swaps onto the live adset. Keep 2-3 ready.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="instagram.com/p/... or shortcode"
          style={{
            flex: 1,
            padding: '10px 12px',
            background: '#050505',
            border: `1px solid ${S.border}`,
            color: S.text,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') add()
          }}
        />
        <button onClick={add} disabled={adding || !input.trim()} style={btn('primary')}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: S.red, marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ fontSize: 12, color: S.dimmer }}>Loading queue…</div>
      ) : queued.length === 0 && used.length === 0 ? (
        <div style={{ fontSize: 12, color: S.dimmer }}>
          Queue empty. Add a recent NM IG post above to enable auto-rotate.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {queued.map(r => (
            <Row
              key={r.id}
              row={r}
              busy={busyId === r.id}
              onApprove={() => patch(r.id, 'approve')}
              onUnapprove={() => patch(r.id, 'unapprove')}
              onArchive={() => patch(r.id, 'archive')}
              onRemove={() => remove(r.id)}
            />
          ))}
          {used.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: S.dimmer, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Used / archived ({used.length + rows.filter(r => r.status === 'archived').length})
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {[...used, ...rows.filter(r => r.status === 'archived')].map(r => (
                  <div key={r.id} style={{ fontSize: 12, color: S.mute, display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      {r.ig_permalink ? (
                        <a href={r.ig_permalink} target="_blank" rel="noreferrer" style={{ color: S.dimmer }}>
                          {r.ig_post_id}
                        </a>
                      ) : (
                        r.ig_post_id
                      )}{' '}
                      · {r.status}
                      {r.used_at ? ` · ${new Date(r.used_at).toLocaleDateString()}` : ''}
                    </span>
                    {r.status === 'archived' && (
                      <button onClick={() => patch(r.id, 'restore')} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 10 }}>
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function Row({
  row,
  busy,
  onApprove,
  onUnapprove,
  onArchive,
  onRemove,
}: {
  row: QueueRow
  busy: boolean
  onApprove: () => void
  onUnapprove: () => void
  onArchive: () => void
  onRemove: () => void
}) {
  const approved = !!row.approved_at
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        border: `1px solid ${approved ? 'rgba(255,42,26,0.25)' : S.border}`,
        background: approved ? 'rgba(255,42,26,0.04)' : 'transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: S.text, fontWeight: 600 }}>
          {row.ig_permalink ? (
            <a href={row.ig_permalink} target="_blank" rel="noreferrer" style={{ color: S.text }}>
              {row.ig_post_id}
            </a>
          ) : (
            row.ig_post_id
          )}
        </div>
        {row.ig_caption_excerpt && (
          <div style={{ fontSize: 11, color: S.dimmer, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.ig_caption_excerpt}
          </div>
        )}
      </div>
      {approved ? (
        <button onClick={onUnapprove} disabled={busy} style={btn('ghost')}>
          ✓ Approved
        </button>
      ) : (
        <button onClick={onApprove} disabled={busy} style={btn('primary')}>
          Approve
        </button>
      )}
      <button onClick={onArchive} disabled={busy} style={btn('ghost')}>
        Archive
      </button>
      <button onClick={onRemove} disabled={busy} style={btn('danger')}>
        Delete
      </button>
    </div>
  )
}
