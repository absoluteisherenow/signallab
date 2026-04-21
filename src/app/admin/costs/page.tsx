'use client'

import { useEffect, useState } from 'react'

interface Report {
  today: { cost: number; calls: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }
  mtd: { cost: number; calls: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }
  byFeature: Array<{ feature: string; cost: number; calls: number }>
  byUser: Array<{ user_id: string; cost: number; calls: number }>
  byModel: Array<{ model: string; cost: number; calls: number }>
  recent: Array<{ called_at: string; feature: string; model: string; cost: number; in: number; out: number; cache_read: number }>
}

const box: React.CSSProperties = { border: '1px solid #1a1a1a', background: '#0a0a0a', padding: 16 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6a6a' }
const value: React.CSSProperties = { fontFamily: 'monospace', fontSize: 22, color: '#f2f2f2', marginTop: 6 }
const subvalue: React.CSSProperties = { fontFamily: 'monospace', fontSize: 11, color: '#6a6a6a', marginTop: 4 }

export default function CostsPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetch('/api/admin/costs', { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          setError((await r.json()).error || `HTTP ${r.status}`)
          return
        }
        setReport(await r.json())
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div style={{ padding: 40, color: '#ff8a7a', fontFamily: 'monospace' }}>Error: {error}</div>
  if (!report) return <div style={{ padding: 40, color: '#6a6a6a', fontFamily: 'monospace' }}>Loading…</div>

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', color: '#c0c0c0', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ ...label, color: '#ff2a1a', marginBottom: 8 }}>Signal Lab OS · API costs</div>
      <div style={{ fontSize: 14, color: '#6a6a6a', marginBottom: 24 }}>Live Anthropic spend from api_usage. Updates on page reload.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 24 }}>
        <div style={box}>
          <div style={label}>Today</div>
          <div style={value}>${report.today.cost.toFixed(2)}</div>
          <div style={subvalue}>{report.today.calls} calls · {report.today.input_tokens.toLocaleString()} in / {report.today.output_tokens.toLocaleString()} out</div>
          <div style={subvalue}>cache read: {report.today.cache_read_tokens.toLocaleString()} tok</div>
        </div>
        <div style={box}>
          <div style={label}>Month to date</div>
          <div style={value}>${report.mtd.cost.toFixed(2)}</div>
          <div style={subvalue}>{report.mtd.calls} calls · {report.mtd.input_tokens.toLocaleString()} in / {report.mtd.output_tokens.toLocaleString()} out</div>
          <div style={subvalue}>cache read: {report.mtd.cache_read_tokens.toLocaleString()} tok</div>
        </div>
        <div style={box}>
          <div style={label}>Projected month</div>
          <div style={value}>${projectMonth(report.mtd.cost).toFixed(2)}</div>
          <div style={subvalue}>on current daily average</div>
        </div>
      </div>

      <Section title="By feature (last 30d)">
        <Table
          headers={['Feature', 'Cost', 'Calls']}
          rows={report.byFeature.map(r => [r.feature, `$${r.cost.toFixed(4)}`, String(r.calls)])}
        />
      </Section>

      <Section title="By model (last 30d)">
        <Table
          headers={['Model', 'Cost', 'Calls']}
          rows={report.byModel.map(r => [r.model, `$${r.cost.toFixed(4)}`, String(r.calls)])}
        />
      </Section>

      <Section title="Top users (MTD)">
        <Table
          headers={['User', 'Cost', 'Calls']}
          rows={report.byUser.map(r => [(r.user_id || '(anon)').slice(0, 8), `$${r.cost.toFixed(4)}`, String(r.calls)])}
        />
      </Section>

      <Section title="Recent calls">
        <Table
          headers={['When', 'Feature', 'Model', 'Cost', 'In', 'Out', 'Cache']}
          rows={report.recent.map(r => [
            new Date(r.called_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            r.feature || '—',
            r.model,
            `$${r.cost.toFixed(5)}`,
            String(r.in || 0),
            String(r.out || 0),
            String(r.cache_read || 0),
          ])}
        />
      </Section>
    </div>
  )
}

function projectMonth(mtdCost: number): number {
  const now = new Date()
  const day = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  if (day === 0) return 0
  return (mtdCost / day) * daysInMonth
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
  if (!rows.length) return <div style={{ fontSize: 11, color: '#6a6a6a' }}>No data.</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#6a6a6a', fontWeight: 400, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: '6px 8px', color: '#c0c0c0', borderBottom: '1px solid #111' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
