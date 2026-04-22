'use client'

import { useEffect, useState } from 'react'

interface HealthRow {
  name: string
  cadence_min: number
  last_run: string | null
  last_status: string | null
  stale: boolean
  success: number
  error: number
  running: number
  avg_ms: number
}

interface RecentRow {
  id: string
  name: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  status: string
  error: string | null
}

interface Report {
  since: string
  total_runs_24h: number
  error_runs_24h: number
  recent: RecentRow[]
  health: HealthRow[]
}

const box: React.CSSProperties = { border: '1px solid #1a1a1a', background: '#0a0a0a', padding: 16 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6a6a' }
const value: React.CSSProperties = { fontFamily: 'monospace', fontSize: 22, color: '#f2f2f2', marginTop: 6 }
const subvalue: React.CSSProperties = { fontFamily: 'monospace', fontSize: 11, color: '#6a6a6a', marginTop: 4 }

function relative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function cadence(min: number): string {
  if (min < 60) return `every ${min}m`
  if (min < 1440) return `every ${min / 60}h`
  return 'daily'
}

export default function CronsPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetch('/api/admin/crons', { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
          return
        }
        setReport(await r.json())
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div style={{ padding: 40, color: '#ff8a7a', fontFamily: 'monospace' }}>Error: {error}</div>
  if (!report) return <div style={{ padding: 40, color: '#6a6a6a', fontFamily: 'monospace' }}>Loading…</div>

  const stale = report.health.filter(h => h.stale)
  const healthy = report.health.filter(h => !h.stale)

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', color: '#c0c0c0', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ ...label, color: '#ff2a1a', marginBottom: 8 }}>Signal Lab OS · cron health</div>
      <div style={{ fontSize: 14, color: '#6a6a6a', marginBottom: 24 }}>Scheduled layer observability. Updates on page reload.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 24 }}>
        <div style={box}>
          <div style={label}>Runs (24h)</div>
          <div style={value}>{report.total_runs_24h}</div>
          <div style={subvalue}>since {new Date(report.since).toLocaleString()}</div>
        </div>
        <div style={box}>
          <div style={label}>Errors (24h)</div>
          <div style={{ ...value, color: report.error_runs_24h > 0 ? '#ff8a7a' : '#f2f2f2' }}>{report.error_runs_24h}</div>
          <div style={subvalue}>failed or non-2xx responses</div>
        </div>
        <div style={box}>
          <div style={label}>Stale crons</div>
          <div style={{ ...value, color: stale.length > 0 ? '#ff8a7a' : '#7abf7a' }}>{stale.length}</div>
          <div style={subvalue}>no run inside 2× cadence window</div>
        </div>
      </div>

      {stale.length > 0 && (
        <Section title="⚠ stale — not firing">
          <Table
            headers={['Cron', 'Cadence', 'Last run', 'Status', 'Success / Error']}
            rows={stale.map(h => [
              h.name,
              cadence(h.cadence_min),
              relative(h.last_run),
              h.last_status || '—',
              `${h.success} / ${h.error}`,
            ])}
          />
        </Section>
      )}

      <Section title="Healthy crons">
        <Table
          headers={['Cron', 'Cadence', 'Last run', 'Last status', 'Success', 'Error', 'Avg ms']}
          rows={healthy.map(h => [
            h.name,
            cadence(h.cadence_min),
            relative(h.last_run),
            h.last_status || '—',
            String(h.success),
            String(h.error),
            String(h.avg_ms),
          ])}
        />
      </Section>

      <Section title="Recent runs">
        <Table
          headers={['Started', 'Cron', 'Status', 'Duration', 'Error']}
          rows={report.recent.map(r => [
            new Date(r.started_at).toLocaleString(),
            r.name,
            r.status,
            r.duration_ms != null ? `${r.duration_ms}ms` : '—',
            r.error || '',
          ])}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...label, marginBottom: 8 }}>{title}</div>
      <div style={box}>{children}</div>
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <div style={{ color: '#6a6a6a', fontSize: 12 }}>no data</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #1a1a1a', color: '#6a6a6a', fontWeight: 400 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid #0f0f0f', color: '#c0c0c0' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
