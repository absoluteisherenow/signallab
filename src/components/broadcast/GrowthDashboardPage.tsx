'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

// ─── Types mirror /api/growth/overview response ─────────────────────────────
type TrajectoryVerdict = 'on_track' | 'ahead' | 'behind' | 'unknown'
type RuleVerdict = 'safe' | 'warning' | 'action' | 'insufficient_data'

interface FollowerPoint { captured_for_date: string; followers_count: number }
interface MonthlyTarget {
  month: string
  planned_spend_gbp: number
  actual_spend_gbp?: number
  projection_conservative: number | null
  projection_realistic: number | null
  projection_optimistic: number | null
  notes: string | null
}
interface FunnelCampaign {
  id: string
  meta_campaign_id: string | null
  name: string
  intent: string
  objective: string
  status: string
  launched_at: string | null
  phase_label: string | null
}
interface ScalingRule {
  id: string
  label: string
  verdict: RuleVerdict
  current_value: number | null
  threshold: string
  recommendation: string | null
}
interface CaptureMoment {
  id: string
  moment_date: string
  label: string
  why: string | null
  content_captured: boolean
  gig_id: string | null
}

interface Overview {
  trajectory: {
    current_followers: number | null
    baseline_followers: number | null
    target_followers: number
    verdict: TrajectoryVerdict
    history: FollowerPoint[]
    monthly_targets: MonthlyTarget[]
  }
  funnel: {
    stage_1: {
      campaigns: FunnelCampaign[]
      retargeting_pool: number
      pool_threshold: number
      pool_ready: boolean
    }
    stage_2: { campaigns: FunnelCampaign[]; active: boolean }
  }
  monthly_budget: MonthlyTarget[]
  scaling_rules: ScalingRule[]
  capture_moments: CaptureMoment[]
  aggregates: {
    total_spend_gbp: number
    total_impressions: number
    total_followers_delta: number
    cost_per_follower_gbp: number | null
  }
}

// ─── BRT theme tokens ───────────────────────────────────────────────────────
const S = {
  red: '#ff2a1a',
  redDim: 'rgba(255,42,26,0.35)',
  bg: '#050505',
  panel: '#0e0e0e',
  panelHi: '#161616',
  border: 'rgba(255,255,255,0.08)',
  borderBright: '#2c2c2c',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
  mute: '#5a5a5a',
  font: "var(--font-mono, 'Helvetica Neue', Helvetica, Arial, sans-serif)",
}

export default function GrowthDashboardPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/growth/overview')
      if (!res.ok) throw new Error(`API ${res.status}`)
      const body = await res.json()
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load growth data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: S.bg,
    color: S.text,
    fontFamily: S.font,
  }

  if (loading && !data) {
    return (
      <div style={shell}>
        <SignalLabHeader />
        <div style={{ padding: '48px 32px', maxWidth: 1100, margin: '0 auto', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.dimmer }}>
          Loading growth data…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={shell}>
        <SignalLabHeader />
        <div style={{ padding: '48px 32px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ color: S.red, fontSize: 12, marginBottom: 12 }}>{error}</div>
          <button
            onClick={load}
            style={{
              padding: '8px 16px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              background: 'transparent', color: S.dim, border: `1px solid ${S.border}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={shell}>
      <SignalLabHeader />
      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header>
          <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: S.dimmer, fontWeight: 700, marginBottom: 6 }}>
            Paid follower growth
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 0.9, textTransform: 'uppercase' }}>
            Growth
          </div>
          <div style={{ fontSize: 12, color: S.dimmer, marginTop: 8 }}>
            Follower plan + live funnel state
          </div>
        </header>

        <TrajectoryCard trajectory={data.trajectory} />
        <FunnelCard funnel={data.funnel} aggregates={data.aggregates} />
        <MonthlyBudgetCard budget={data.monthly_budget} />
        <ScalingRulesCard rules={data.scaling_rules} />
        <CaptureMomentsCard moments={data.capture_moments} />
      </div>
    </div>
  )
}

// ─── Panel base style ───────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: S.panel,
  border: `1px solid ${S.border}`,
  padding: 20,
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: S.dimmer, fontWeight: 700, marginBottom: 12 }}>
      {children}
    </div>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: S.mute, fontWeight: 700 }}>
      {children}
    </div>
  )
}

// ─── Trajectory hero ────────────────────────────────────────────────────────
function TrajectoryCard({ trajectory }: { trajectory: Overview['trajectory'] }) {
  const { current_followers, baseline_followers, target_followers, verdict, history, monthly_targets } = trajectory
  const progress =
    current_followers != null && baseline_followers != null
      ? Math.max(0, Math.min(1, (current_followers - baseline_followers) / (target_followers - baseline_followers)))
      : 0

  // All verdicts styled in red/neutral only (no green/sky/amber).
  const verdictLabel: Record<TrajectoryVerdict, { text: string; color: string }> = {
    ahead: { text: 'Ahead of plan', color: S.red },
    on_track: { text: 'On track', color: S.text },
    behind: { text: 'Behind plan', color: S.red },
    unknown: { text: 'Insufficient data', color: S.mute },
  }

  return (
    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <MiniLabel>Followers</MiniLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 0.9, color: S.text }}>
              {current_followers?.toLocaleString() ?? '—'}
            </span>
            <span style={{ fontSize: 16, color: S.dimmest }}>/ {target_followers.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: verdictLabel[verdict].color }}>
            {verdictLabel[verdict].text}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <TrajectoryChart history={history} targets={monthly_targets} target={target_followers} />
        </div>
      </div>

      {/* Progress bar — brutalist: solid red fill on dark neutral track, no rounding */}
      <div style={{ marginTop: 16 }}>
        <div style={{ height: 2, background: '#1a1a1a', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${progress * 100}%`, background: S.red, transition: 'width 300ms' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.mute, marginTop: 6, fontFamily: 'inherit' }}>
          <span>{baseline_followers?.toLocaleString() ?? '—'}</span>
          <span style={{ color: S.dim }}>{Math.round(progress * 100)}%</span>
          <span>{target_followers.toLocaleString()}</span>
        </div>
      </div>
    </section>
  )
}

function TrajectoryChart({
  history,
  targets,
  target,
}: {
  history: FollowerPoint[]
  targets: MonthlyTarget[]
  target: number
}) {
  const width = 400
  const height = 150
  const pad = { t: 8, r: 6, b: 22, l: 40 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b

  const { minX, maxX, maxY } = useMemo(() => {
    const allDates = [...history.map(h => h.captured_for_date), ...targets.map(t => `${t.month}-01`)]
    const xs = allDates.map(d => new Date(d).getTime())
    const ys = [
      ...history.map(h => h.followers_count),
      ...targets.flatMap(t => [t.projection_conservative, t.projection_realistic, t.projection_optimistic]),
      target,
    ].filter((n): n is number => n != null)

    return {
      minX: xs.length ? Math.min(...xs) : Date.now(),
      maxX: xs.length ? Math.max(...xs) : Date.now(),
      maxY: ys.length ? Math.max(...ys) * 1.05 : target,
    }
  }, [history, targets, target])

  const xScale = (t: number) => (maxX === minX ? 0 : ((t - minX) / (maxX - minX)) * W)
  const yScale = (v: number) => H - (v / maxY) * H

  const historyPath =
    history.length > 0
      ? history
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(new Date(p.captured_for_date).getTime())},${yScale(p.followers_count)}`)
          .join(' ')
      : ''

  const projectionLine = (key: 'projection_conservative' | 'projection_realistic' | 'projection_optimistic') =>
    targets
      .filter(t => t[key] != null)
      .map((t, i) => {
        const x = xScale(new Date(`${t.month}-15`).getTime())
        const y = yScale(t[key] as number)
        return `${i === 0 ? 'M' : 'L'}${x},${y}`
      })
      .join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', fontFamily: S.font }}>
      {/* Y-axis grid — neutral */}
      {[0, 0.25, 0.5, 0.75, 1].map(p => (
        <line
          key={p}
          x1={pad.l}
          x2={pad.l + W}
          y1={pad.t + H - p * H}
          y2={pad.t + H - p * H}
          stroke="#ffffff"
          strokeOpacity="0.05"
        />
      ))}
      {/* 10K target line — red accent */}
      <line
        x1={pad.l}
        x2={pad.l + W}
        y1={pad.t + yScale(target)}
        y2={pad.t + yScale(target)}
        stroke={S.red}
        strokeDasharray="4 4"
        strokeOpacity="0.7"
      />
      <text x={pad.l - 6} y={pad.t + yScale(target) + 3} fontSize="9" fill={S.red} textAnchor="end" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        10K
      </text>

      <g transform={`translate(${pad.l},${pad.t})`}>
        {/* Projection bands — all neutral greys, dash differentiates */}
        <path d={projectionLine('projection_optimistic')} fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeDasharray="2 3" />
        <path d={projectionLine('projection_realistic')} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeDasharray="4 2" />
        <path d={projectionLine('projection_conservative')} fill="none" stroke="#ffffff" strokeOpacity="0.15" strokeDasharray="2 3" />

        {/* Actual history line — solid red, 2px */}
        <path d={historyPath} fill="none" stroke={S.red} strokeWidth="2" />
        {history.map(p => (
          <rect
            key={p.captured_for_date}
            x={xScale(new Date(p.captured_for_date).getTime()) - 2}
            y={yScale(p.followers_count) - 2}
            width="4"
            height="4"
            fill={S.red}
          />
        ))}
      </g>

      {/* Legend — 9px caps, neutral with single red swatch for actual */}
      <g transform={`translate(${pad.l}, ${height - 4})`} fontSize="9" fill={S.dimmer} style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        <g><rect width="10" height="2" y="-3" fill={S.red} /><text x="14" y="0">actual</text></g>
        <g transform="translate(64,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.5" /><text x="14" y="0">realistic</text></g>
        <g transform="translate(136,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.25" /><text x="14" y="0">optimistic</text></g>
        <g transform="translate(214,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.15" /><text x="14" y="0">conservative</text></g>
      </g>
    </svg>
  )
}

// ─── Funnel state ───────────────────────────────────────────────────────────
function FunnelCard({ funnel, aggregates }: { funnel: Overview['funnel']; aggregates: Overview['aggregates'] }) {
  return (
    <section style={panel}>
      <SectionTitle>Two-stage funnel</SectionTitle>
      <div style={{ fontSize: 11, color: S.dimmest, marginTop: -8, marginBottom: 14 }}>
        Stage 1 = Video Views (cold reach) → Stage 2 = Engagement retargeting
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Stage 1 */}
        <div style={{ background: S.panelHi, border: `1px solid ${S.border}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Stage 1 · Always-on</div>
            <StatusBadge
              active={funnel.stage_1.campaigns.length > 0}
              label={`${funnel.stage_1.campaigns.length} active`}
            />
          </div>
          <div style={{ fontSize: 11, color: S.dimmer, marginBottom: 12 }}>
            Boost best organic video · Video Views objective
          </div>
          <MetricRow label="Retargeting pool (75%+ viewers)" value={funnel.stage_1.retargeting_pool.toLocaleString()} />
          <MetricRow
            label="Pool threshold"
            value={`${funnel.stage_1.pool_threshold.toLocaleString()}${funnel.stage_1.pool_ready ? ' ✓' : ''}`}
            accent={funnel.stage_1.pool_ready}
          />
          {funnel.stage_1.campaigns.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: S.red, letterSpacing: '0.08em' }}>
              No Stage 1 running. Launch one from the planner.
            </div>
          )}
        </div>

        {/* Stage 2 */}
        <div style={{ background: S.panelHi, border: `1px solid ${S.border}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Stage 2 · Burst</div>
            <StatusBadge active={funnel.stage_2.active} label={funnel.stage_2.active ? 'active' : 'inactive'} />
          </div>
          <div style={{ fontSize: 11, color: S.dimmer, marginBottom: 12 }}>
            Retarget 75%+ viewers · Engagement · Around releases
          </div>
          <MetricRow
            label="Unlocks when"
            value={funnel.stage_1.pool_ready ? 'pool ready' : 'pool < 1K'}
            accent={funnel.stage_1.pool_ready}
          />
          {!funnel.stage_2.active && funnel.stage_1.pool_ready && (
            <div style={{ marginTop: 10, fontSize: 11, color: S.red, letterSpacing: '0.08em' }}>
              Pool is warm. Next release burst can go.
            </div>
          )}
        </div>
      </div>

      {/* Aggregates */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <AggregateBox label="Total spend">
          <BlurredAmount>£{aggregates.total_spend_gbp.toFixed(2)}</BlurredAmount>
        </AggregateBox>
        <AggregateBox label="Impressions" value={aggregates.total_impressions.toLocaleString()} />
        <AggregateBox label="Followers gained" value={aggregates.total_followers_delta.toLocaleString()} />
        <AggregateBox label="Cost / follower">
          {aggregates.cost_per_follower_gbp != null ? (
            <BlurredAmount>£{aggregates.cost_per_follower_gbp.toFixed(2)}</BlurredAmount>
          ) : (
            <span style={{ color: S.mute }}>—</span>
          )}
        </AggregateBox>
      </div>
    </section>
  )
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      style={{
        fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
        padding: '3px 8px',
        border: `1px solid ${active ? S.red : S.border}`,
        color: active ? S.red : S.mute,
        background: active ? 'rgba(255,42,26,0.08)' : 'transparent',
      }}
    >
      {label}
    </span>
  )
}

// ─── Monthly budget table ───────────────────────────────────────────────────
function MonthlyBudgetCard({ budget }: { budget: MonthlyTarget[] }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const th: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
    color: S.mute, padding: '8px 8px', textAlign: 'left' as const,
    borderBottom: `1px solid ${S.border}`,
  }
  const td: React.CSSProperties = {
    fontSize: 12, padding: '10px 8px', borderBottom: `1px solid ${S.border}`,
    fontVariantNumeric: 'tabular-nums' as const,
  }

  return (
    <section style={panel}>
      <SectionTitle>Monthly budget vs actual</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
          <thead>
            <tr>
              <th style={th}>Month</th>
              <th style={{ ...th, textAlign: 'right' }}>Planned</th>
              <th style={{ ...th, textAlign: 'right' }}>Actual</th>
              <th style={{ ...th, textAlign: 'right' }}>Target (realistic)</th>
              <th style={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {budget.map(row => {
              const isCurrent = row.month === currentMonth
              const actual = row.actual_spend_gbp ?? 0
              const planned = row.planned_spend_gbp ?? 0
              const overBudget = planned > 0 && actual > planned * 1.15
              return (
                <tr key={row.month} style={{ background: isCurrent ? 'rgba(255,42,26,0.04)' : 'transparent' }}>
                  <td style={td}>
                    <span style={{ color: S.text }}>{row.month}</span>
                    {isCurrent && (
                      <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: '0.2em', color: S.red, fontWeight: 700 }}>
                        NOW
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: S.dim }}>
                    <BlurredAmount>£{planned.toFixed(0)}</BlurredAmount>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: overBudget ? S.red : S.dim }}>
                    <BlurredAmount>£{actual.toFixed(2)}</BlurredAmount>
                    {overBudget && <span style={{ marginLeft: 4, fontSize: 10 }}>!</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: S.dim }}>
                    {row.projection_realistic?.toLocaleString() ?? '—'}
                  </td>
                  <td style={{ ...td, color: S.dimmer, fontSize: 11 }}>{row.notes}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Scaling rules ──────────────────────────────────────────────────────────
function ScalingRulesCard({ rules }: { rules: ScalingRule[] }) {
  // Neutralised palette: action=red (only), warning=dim text w/ subtle red, safe/no_data=neutral grey.
  const verdictStyle: Record<RuleVerdict, { bg: string; border: string; color: string }> = {
    action: { bg: 'rgba(255,42,26,0.08)', border: S.red, color: S.red },
    warning: { bg: 'rgba(255,42,26,0.03)', border: S.redDim, color: S.dim },
    safe: { bg: 'transparent', border: S.border, color: S.dimmer },
    insufficient_data: { bg: 'transparent', border: S.border, color: S.mute },
  }
  const verdictText: Record<RuleVerdict, string> = {
    action: 'ACT',
    warning: 'WATCH',
    safe: 'OK',
    insufficient_data: 'NO DATA',
  }

  return (
    <section style={panel}>
      <SectionTitle>Scaling rules — live</SectionTitle>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
        {rules.map(r => {
          const st = verdictStyle[r.verdict]
          return (
            <li
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '10px 14px',
                background: st.bg,
                border: `1px solid ${st.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                  minWidth: 64, textAlign: 'center', color: st.color,
                }}
              >
                {verdictText[r.verdict]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: S.text }}>{r.label}</div>
                {r.recommendation && (
                  <div style={{ fontSize: 11, color: S.dimmer, marginTop: 2 }}>{r.recommendation}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: S.dimmer, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {r.current_value != null ? r.current_value.toFixed(2) : '—'}
                <span style={{ color: S.mute, marginLeft: 6 }}>· {r.threshold}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Capture moments ────────────────────────────────────────────────────────
function CaptureMomentsCard({ moments }: { moments: CaptureMoment[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = moments.filter(m => m.moment_date >= today)
  const past = moments.filter(m => m.moment_date < today)

  return (
    <section style={panel}>
      <SectionTitle>Content capture calendar</SectionTitle>
      <div style={{ fontSize: 11, color: S.dimmest, marginTop: -8, marginBottom: 14 }}>
        Paid spend multiplies what exists. Bank this content.
      </div>

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MiniLabel>Upcoming</MiniLabel>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map(m => (
              <MomentRow key={m.id} moment={m} />
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <MiniLabel>Past</MiniLabel>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {past.map(m => (
              <MomentRow key={m.id} moment={m} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function MomentRow({ moment }: { moment: CaptureMoment }) {
  const d = new Date(moment.moment_date)
  const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', background: S.panelHi, border: `1px solid ${S.border}` }}>
      <div style={{ fontSize: 11, color: S.dimmer, minWidth: 56, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{dateLabel}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: S.text }}>{moment.label}</div>
        {moment.why && <div style={{ fontSize: 11, color: S.dimmer, marginTop: 2 }}>{moment.why}</div>}
      </div>
      <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
        {moment.content_captured ? (
          <span style={{ color: S.red }}>✓ captured</span>
        ) : (
          <span style={{ color: S.mute }}>pending</span>
        )}
      </div>
    </li>
  )
}

// ─── Small utilities ────────────────────────────────────────────────────────
function MetricRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '4px 0' }}>
      <span style={{ color: S.dimmer }}>{label}</span>
      <span style={{ color: accent ? S.red : S.text, fontVariantNumeric: 'tabular-nums', fontWeight: accent ? 700 : 500 }}>{value}</span>
    </div>
  )
}

function AggregateBox({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: S.panelHi, border: `1px solid ${S.border}`, padding: '10px 12px' }}>
      <MiniLabel>{label}</MiniLabel>
      <div style={{ fontSize: 14, color: S.text, marginTop: 4, fontWeight: 500 }}>{children ?? value}</div>
    </div>
  )
}
