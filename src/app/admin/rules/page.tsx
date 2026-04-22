'use client'

import { useEffect, useState } from 'react'

interface RuleRow {
  id: string
  slug: string
  name: string
  category: string
  severity: string
  applies_to: string[]
  body: string
  active_until?: string | null
  source?: string
}

interface LibraryRow {
  slug: string
  name: string
  category: string
  severity: string
  applies_to: string[]
  body: string
}

interface Report {
  active: RuleRow[]
  retired: RuleRow[]
  library_available: LibraryRow[]
}

const box: React.CSSProperties = { border: '1px solid #1a1a1a', background: '#0a0a0a', padding: 16 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6a6a' }

const SEVERITY_COLORS: Record<string, string> = {
  hard_block: '#ff8a7a',
  soft_flag: '#f0b070',
  advisory: '#6a8aa0',
  auto_fix: '#7abf7a',
}

export default function RulesPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    fetch('/api/admin/rules', { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
          return
        }
        setReport(await r.json())
      })
      .catch(e => setError(e.message))
  }

  useEffect(load, [])

  const act = async (payload: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey)
    try {
      const r = await fetch('/api/admin/rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      else load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div style={{ padding: 40, color: '#ff8a7a', fontFamily: 'monospace' }}>Error: {error}</div>
  if (!report) return <div style={{ padding: 40, color: '#6a6a6a', fontFamily: 'monospace' }}>Loading…</div>

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', color: '#c0c0c0', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ ...label, color: '#ff2a1a', marginBottom: 8 }}>Signal Lab OS · rule registry</div>
      <div style={{ fontSize: 14, color: '#6a6a6a', marginBottom: 24 }}>
        Active rules govern every brain-wrapped call. Promote a library default into your registry, retire a rule that's stopped serving, or change severity in place.
      </div>

      <Section title={`Active rules (${report.active.length})`}>
        {report.active.length === 0 ? (
          <div style={{ color: '#6a6a6a', fontSize: 12 }}>no active rules — promote from the library below</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Rule</th>
                <th style={th}>Category</th>
                <th style={th}>Severity</th>
                <th style={th}>Applies to</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.active.map(r => (
                <tr key={r.id}>
                  <td style={td}>
                    <div style={{ color: '#f2f2f2' }}>{r.name}</div>
                    <div style={{ color: '#6a6a6a', fontSize: 10 }}>{r.slug}</div>
                  </td>
                  <td style={td}>{r.category}</td>
                  <td style={{ ...td, color: SEVERITY_COLORS[r.severity] || '#c0c0c0' }}>
                    <select
                      value={r.severity}
                      disabled={busy === `sev-${r.id}`}
                      onChange={e => act({ action: 'severity', id: r.id, severity: e.target.value }, `sev-${r.id}`)}
                      style={sel}
                    >
                      <option value="hard_block">hard_block</option>
                      <option value="soft_flag">soft_flag</option>
                      <option value="auto_fix">auto_fix</option>
                      <option value="advisory">advisory</option>
                    </select>
                  </td>
                  <td style={td}>{(r.applies_to || []).join(', ')}</td>
                  <td style={td}>
                    <button
                      style={btn}
                      disabled={busy === `retire-${r.id}`}
                      onClick={() => {
                        if (!window.confirm(`Retire rule "${r.name}"? Brain will stop applying it immediately.`)) return
                        act({ action: 'retire', id: r.id }, `retire-${r.id}`)
                      }}
                    >
                      {busy === `retire-${r.id}` ? '…' : 'retire'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Available in library (${report.library_available.length})`}>
        {report.library_available.length === 0 ? (
          <div style={{ color: '#6a6a6a', fontSize: 12 }}>every library rule already exists in your registry</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Rule</th>
                <th style={th}>Category</th>
                <th style={th}>Severity</th>
                <th style={th}>Applies to</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.library_available.map(r => (
                <tr key={r.slug}>
                  <td style={td}>
                    <div style={{ color: '#f2f2f2' }}>{r.name}</div>
                    <div style={{ color: '#6a6a6a', fontSize: 10 }}>{r.slug}</div>
                  </td>
                  <td style={td}>{r.category}</td>
                  <td style={{ ...td, color: SEVERITY_COLORS[r.severity] || '#c0c0c0' }}>{r.severity}</td>
                  <td style={td}>{(r.applies_to || []).join(', ')}</td>
                  <td style={td}>
                    <button
                      style={btn}
                      disabled={busy === `promote-${r.slug}`}
                      onClick={() => act({ action: 'promote', slug: r.slug }, `promote-${r.slug}`)}
                    >
                      {busy === `promote-${r.slug}` ? '…' : 'promote'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {report.retired.length > 0 && (
        <Section title={`Retired (${report.retired.length})`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Rule</th>
                <th style={th}>Category</th>
                <th style={th}>Severity</th>
                <th style={th}>Retired at</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.retired.map(r => (
                <tr key={r.id}>
                  <td style={td}>
                    <div style={{ color: '#f2f2f2' }}>{r.name}</div>
                    <div style={{ color: '#6a6a6a', fontSize: 10 }}>{r.slug}</div>
                  </td>
                  <td style={td}>{r.category}</td>
                  <td style={{ ...td, color: SEVERITY_COLORS[r.severity] || '#c0c0c0' }}>{r.severity}</td>
                  <td style={td}>{r.active_until ? new Date(r.active_until).toLocaleString() : '—'}</td>
                  <td style={td}>
                    <button
                      style={btn}
                      disabled={busy === `restore-${r.id}`}
                      onClick={() => act({ action: 'restore', id: r.id }, `restore-${r.id}`)}
                    >
                      {busy === `restore-${r.id}` ? '…' : 'restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #1a1a1a', color: '#6a6a6a', fontWeight: 400 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #0f0f0f', color: '#c0c0c0', verticalAlign: 'top' }
const btn: React.CSSProperties = { background: '#1a1a1a', color: '#f2f2f2', border: '1px solid #2a2a2a', padding: '4px 10px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }
const sel: React.CSSProperties = { background: '#0a0a0a', color: '#f2f2f2', border: '1px solid #2a2a2a', padding: '2px 4px', fontFamily: 'monospace', fontSize: 11 }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...label, marginBottom: 8 }}>{title}</div>
      <div style={box}>{children}</div>
    </div>
  )
}
