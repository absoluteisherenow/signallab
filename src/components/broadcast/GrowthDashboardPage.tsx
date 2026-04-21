'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { BlurredAmount } from '@/components/ui/BlurredAmount'
import LaunchConfigModal from '@/components/broadcast/ads/LaunchConfigModal'
import AdsAutomationInbox from '@/components/broadcast/ads/AdsAutomationInbox'
import CreativeQueueManager from '@/components/broadcast/ads/CreativeQueueManager'
import type { MetaObjective, LaunchIntent } from '@/lib/ads/meta-launch'

type LaunchPrefill = {
  objective: MetaObjective
  intent: LaunchIntent
  name: string
  phase_label: string
  duration_days: number
  age_min: number
  age_max: number
  hypothesis: string
  daily_budget_gbp: number
  countries: string // ISO comma-separated — prefill drives initial geo mix
}

// Stage 1 strategy (Apr 2026): maximise follower velocity, not retargeting-pool depth.
//
// Objective: OUTCOME_ENGAGEMENT (was OUTCOME_AWARENESS/Video Views). Engagement
// optimises for saves, comments, shares, AND profile visits — profile visits
// are the direct follower engine. Video Views built a warm pool for Stage 2 to
// retarget later; fine play, but slower to produce actual follows in week 1.
//
// Budget anchored to NM's canonical plan (src/lib/skillPrompts.ts L605:
// "ALWAYS-ON: £3-5/day"). £3/day × 30 days = £90/mo.
//
// Geo — three bands:
//   1. Proven (from NM's own post history): GB (fabric / Phonica / Percolate),
//      AU (pitchmusicandarts), GR (Athens / Apparat).
//   2. Tier-1 test (high-signal electronic scenes, not yet confirmed as NM
//      audience): IE, NL, DE, BE, US.
//   3. Market-building bets — places NM actively wants to play:
//        MX (CDMX especially — fastest-growing electronic scene in LATAM,
//           priority booking target),
//        IN (nascent but growing — smaller allocation expected; Meta's
//           cost-per-engagement will self-balance).
//   Meta self-allocates spend to wherever cost-per-engagement is cheapest;
//   after 7 days we'll have real NM cost-per-follower by country to refine on.
//   If IN turns out to cost-deliver followers that don't convert to profile
//   visits we drop it on the next rotation.
const STAGE_1_PREFILL: LaunchPrefill = {
  objective: 'OUTCOME_AWARENESS',
  intent: 'growth_stage_1',
  name: `Stage 1 always-on — ${new Date().toISOString().slice(0, 10)}`,
  phase_label: 'stage_1_always_on',
  duration_days: 30,
  age_min: 22,
  age_max: 45,
  daily_budget_gbp: 3,
  countries: 'GB, IE, AU, GR, NL, DE, BE, US, MX, IN',
  hypothesis: 'Engagement-objective boost on highest-save-rate NM post across proven (GB/AU/GR), Tier-1 test (IE/NL/DE/BE/US), and booking-target markets (MX/IN) builds profile-visit → follower velocity while seeding audience where NM wants to tour next.',
}

// Release burst anchored to skillPrompts L506 "RELEASE: £10-30/day minimum
// (under £10/day won't exit learning phase)". £10/day × 7 days = £70 total.
// Stage 2 inherits the Stage 1 geo mix — the warm pool is already filtered to
// whoever engaged, so Meta only retargets users from those markets. Keeping
// the country list in sync avoids "pool has engagers from X but we're not
// targeting X in the burst" gotchas.
const STAGE_2_PREFILL: LaunchPrefill = {
  objective: 'OUTCOME_AWARENESS',
  intent: 'growth_stage_2',
  name: `Stage 2 release burst — ${new Date().toISOString().slice(0, 10)}`,
  phase_label: 'stage_2_release_burst',
  duration_days: 7,
  age_min: 22,
  age_max: 45,
  daily_budget_gbp: 10,
  countries: 'GB, IE, AU, GR, NL, DE, BE, US, MX, IN',
  hypothesis: 'Retargeting the warm pool around a release beats cold reach on cost per follower.',
}

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
interface ExpectedAction {
  endpoint: string
  payload: Record<string, unknown>
  confirm_prompt: string
}
interface ScalingRule {
  id: string
  label: string
  verdict: RuleVerdict
  current_value: number | null
  threshold: string
  recommendation: string | null
  expected_action?: ExpectedAction
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

// ─── Shared action-button styles ────────────────────────────────────────────
const actionBtn: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  border: `1px solid ${S.red}`,
  color: S.red,
  background: 'rgba(255,42,26,0.08)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  border: `1px solid ${S.border}`,
  color: S.dim,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

export default function GrowthDashboardPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [launchPrefill, setLaunchPrefill] = useState<LaunchPrefill | null>(null)

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

  // ── Apply a scaling-rule expected_action ──
  const applyRule = useCallback(async (rule: ScalingRule) => {
    if (!rule.expected_action) return
    const action = rule.expected_action

    // Deep-link actions (planner routes) — navigate, no POST.
    if (action.endpoint.startsWith('/')) {
      if (!action.endpoint.startsWith('/api/')) {
        window.location.href = action.endpoint
        return
      }
    }

    if (action.confirm_prompt && !window.confirm(action.confirm_prompt)) return

    setBusyRuleId(rule.id)
    try {
      const res = await fetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed: ${err?.error || res.statusText}`)
      } else {
        await load()
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setBusyRuleId(null)
    }
  }, [load])

  // ── Toggle a capture moment captured/pending ──
  const toggleCaptured = useCallback(async (id: string, next: boolean) => {
    try {
      const res = await fetch(`/api/growth/capture-moments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_captured: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed: ${err?.error || res.statusText}`)
        return
      }
      await load()
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }, [load])

  // ── Update planned spend for a month ──
  const updatePlanned = useCallback(async (month: string, planned: number) => {
    try {
      const res = await fetch('/api/growth/monthly-target', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, planned_spend_gbp: planned }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed: ${err?.error || res.statusText}`)
        return
      }
      await load()
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
    }
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

        <HeroLaunchCard
          data={data}
          onLaunchStage1={() => setLaunchPrefill(STAGE_1_PREFILL)}
          onLaunchStage2={() => setLaunchPrefill(STAGE_2_PREFILL)}
        />
        <AdsAutomationInbox
          onLaunchStage2={() => setLaunchPrefill(STAGE_2_PREFILL)}
          onDirty={load}
        />
        <CreativeQueueManager intent="growth_stage_1" />
        <NorthStarRibbon data={data} />
        <TrajectoryCard
          trajectory={data.trajectory}
          onVerdictClick={() => setDrawerOpen(true)}
        />
        <FunnelCard
          funnel={data.funnel}
          aggregates={data.aggregates}
          onLaunchStage1={() => setLaunchPrefill(STAGE_1_PREFILL)}
          onLaunchStage2={() => setLaunchPrefill(STAGE_2_PREFILL)}
        />
        <MonthlyBudgetCard budget={data.monthly_budget} onUpdatePlanned={updatePlanned} />
        <ScalingRulesCard rules={data.scaling_rules} busyRuleId={busyRuleId} onApply={applyRule} />
        <CaptureMomentsCard moments={data.capture_moments} onToggleCaptured={toggleCaptured} />

        {/* Mount the modal only when open so useState hooks initialize
            fresh from `prefill` on each open. Keeps prefill in sync without
            needing a sync-effect inside the modal. */}
        {launchPrefill && (
          <LaunchConfigModal
            open={true}
            onClose={() => setLaunchPrefill(null)}
            onLaunched={() => {
              setLaunchPrefill(null)
              load()
            }}
            prefill={launchPrefill}
            postPickerMode={true}
          />
        )}
      </div>

      {drawerOpen && (
        <TrajectoryDrawer
          data={data}
          onClose={() => setDrawerOpen(false)}
          onRegenerateStrategy={async () => {
            if (!window.confirm('Regenerate monthly strategy brief based on this data?')) return
            try {
              const res = await fetch('/api/strategy/doc/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ triggered_by: 'behind_plan' }),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                alert(`Failed: ${err?.error || res.statusText}`)
              } else {
                alert('New brief drafted — find it in Broadcast → Plan → Strategy.')
              }
            } catch (err) {
              alert(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Panel base style ───────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: S.panel,
  border: `1px solid ${S.border}`,
  padding: 20,
}

// ─── Hero launch card ───────────────────────────────────────────────────────
/**
 * The page's most prominent affordance. Picks between:
 *   1. "Launch Stage 1" — if no Stage 1 is running.
 *   2. "Launch release burst" — if Stage 1 running + pool ready + no Stage 2.
 *   3. Status summary — everything's running, show what's live.
 *
 * For NM the prereqs (IG_ACTOR_ID, AD_ACCOUNT_ID, baseline) live in env, so the
 * button always fires the modal. Future multi-user gate lands here.
 */
function HeroLaunchCard({
  data,
  onLaunchStage1,
  onLaunchStage2,
}: {
  data: Overview
  onLaunchStage1: () => void
  onLaunchStage2: () => void
}) {
  const stage1Running = data.funnel.stage_1.campaigns.some(c => c.status === 'active')
  const stage1AnyCampaign = data.funnel.stage_1.campaigns.length > 0
  const stage2Running = data.funnel.stage_2.active
  const poolReady = data.funnel.stage_1.pool_ready
  const poolCount = data.funnel.stage_1.retargeting_pool
  const poolThreshold = data.funnel.stage_1.pool_threshold

  // Mode
  const mode: 'stage1' | 'stage2' | 'all_running' | 'paused' =
    !stage1AnyCampaign ? 'stage1'
    : stage1Running && poolReady && !stage2Running ? 'stage2'
    : stage1Running && stage2Running ? 'all_running'
    : 'paused'

  const heroBtn: React.CSSProperties = {
    padding: '18px 28px',
    fontSize: 14,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontWeight: 800,
    background: S.red,
    color: '#000',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 0 0 1px rgba(255,42,26,0.35), 0 8px 24px rgba(255,42,26,0.18)',
  }

  return (
    <section
      style={{
        ...panel,
        padding: 24,
        background: mode === 'all_running' ? S.panel : 'linear-gradient(180deg, rgba(255,42,26,0.08) 0%, rgba(255,42,26,0.02) 100%)',
        borderColor: mode === 'all_running' ? S.border : S.red,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <MiniLabel>{mode === 'all_running' ? 'Funnel live' : 'Next move'}</MiniLabel>

          {mode === 'stage1' && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: S.text }}>
                Launch Stage 1 — always-on follower engine
              </div>
              <div style={{ fontSize: 12, color: S.dim, marginTop: 6, lineHeight: 1.6 }}>
                Boosts your highest-save-rate post on the Engagement objective across proven markets (GB/AU/GR), Tier-1 tests (IE/NL/DE/BE/US), and booking targets (MX/IN) — Meta routes spend to the cheapest profile-visit → follower pipeline. Default: <BlurredAmount>£3/day</BlurredAmount> for 30 days (edit budget, geo &amp; duration before launch). Launches PAUSED — one final activate click after you review the preview.
              </div>
            </>
          )}

          {mode === 'stage2' && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: S.text }}>
                Release burst — pool ready ({poolCount.toLocaleString()} ≥ {poolThreshold.toLocaleString()})
              </div>
              <div style={{ fontSize: 12, color: S.dim, marginTop: 6, lineHeight: 1.6 }}>
                Retargets the 75%+ viewer pool on Engagement. Default: <BlurredAmount>£10/day</BlurredAmount> for 7 days (edit before launch — Meta&apos;s learning phase tends to need &gt;<BlurredAmount>£10/day</BlurredAmount>). Launches PAUSED pending your review.
              </div>
            </>
          )}

          {mode === 'all_running' && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: S.text }}>
                Stage 1 + Stage 2 both running
              </div>
              <div style={{ fontSize: 12, color: S.dim, marginTop: 6, lineHeight: 1.6 }}>
                Keep the funnel fed. Watch the rules card for swap or pause signals.
              </div>
            </>
          )}

          {mode === 'paused' && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: S.text }}>
                Stage 1 is paused
              </div>
              <div style={{ fontSize: 12, color: S.dim, marginTop: 6, lineHeight: 1.6 }}>
                {poolReady
                  ? 'Pool is warm but Stage 1 isn\u2019t active. Re-activate Stage 1 or launch a fresh burst.'
                  : 'Resume Stage 1 or launch a new one to keep building the pool.'}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mode === 'stage1' && (
            <button onClick={onLaunchStage1} style={heroBtn}>
              Launch Stage 1
            </button>
          )}
          {mode === 'stage2' && (
            <button onClick={onLaunchStage2} style={heroBtn}>
              Launch release burst
            </button>
          )}
          {mode === 'paused' && (
            <button onClick={onLaunchStage1} style={heroBtn}>
              Launch Stage 1
            </button>
          )}
          {mode === 'all_running' && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', border: `1px solid ${S.border}`,
                fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: S.dim,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: S.red, display: 'inline-block' }} />
              Live
            </div>
          )}
        </div>
      </div>

      {/* Preflight — prereq check. For NM everything is wired via env. */}
      <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.dimmest }}>
        <span>✓ IG account</span>
        <span>✓ Meta ad account</span>
        <span>✓ Baseline captured</span>
      </div>
    </section>
  )
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

// ─── North-star ribbon ──────────────────────────────────────────────────────
function NorthStarRibbon({ data }: { data: Overview }) {
  const cur = data.trajectory.current_followers ?? 0
  const target = data.trajectory.target_followers
  const need = Math.max(0, target - cur)

  // Rough monthly pace: total delta / months of history
  const hist = data.trajectory.history
  const pace = (() => {
    if (hist.length < 2) return null
    const first = hist[0]
    const last = hist[hist.length - 1]
    const days = (new Date(last.captured_for_date).getTime() - new Date(first.captured_for_date).getTime()) / 86400000
    if (days <= 0) return null
    const delta = last.followers_count - first.followers_count
    const perMonth = (delta / days) * 30
    return Math.round(perMonth)
  })()

  // Biggest lever = first ACT rule, fallback first WARNING, else a gentle default
  const actRule = data.scaling_rules.find(r => r.verdict === 'action')
  const watchRule = data.scaling_rules.find(r => r.verdict === 'warning')
  const lever = actRule?.recommendation
    ?? watchRule?.recommendation
    ?? (!data.funnel.stage_1.campaigns.length ? 'Launch Stage 1 always-on to start building the retargeting pool.' : 'Keep Stage 1 running and capture content from upcoming gigs.')

  return (
    <section style={{ ...panel, padding: '14px 20px', background: 'rgba(255,42,26,0.04)', borderColor: S.redDim }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16, flex: 1, minWidth: 280, flexWrap: 'wrap' }}>
          <Stat label="Target" value={target.toLocaleString()} />
          <Stat label="Current" value={cur.toLocaleString()} />
          <Stat label="Need" value={`+${need.toLocaleString()}`} accent />
          <Stat label="Pace / mo" value={pace != null ? `${pace >= 0 ? '+' : ''}${pace}` : '—'} />
        </div>
        <div style={{ flex: 2, minWidth: 320, borderLeft: `1px solid ${S.border}`, paddingLeft: 18 }}>
          <MiniLabel>Biggest lever this week</MiniLabel>
          <div style={{ fontSize: 13, color: S.text, marginTop: 4, lineHeight: 1.5 }}>{lever}</div>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? S.red : S.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

// ─── Trajectory hero ────────────────────────────────────────────────────────
function TrajectoryCard({
  trajectory,
  onVerdictClick,
}: {
  trajectory: Overview['trajectory']
  onVerdictClick: () => void
}) {
  const { current_followers, baseline_followers, target_followers, verdict, history, monthly_targets } = trajectory
  const progress =
    current_followers != null && baseline_followers != null
      ? Math.max(0, Math.min(1, (current_followers - baseline_followers) / (target_followers - baseline_followers)))
      : 0

  const verdictLabel: Record<TrajectoryVerdict, { text: string; color: string }> = {
    ahead: { text: 'Ahead of plan', color: S.red },
    on_track: { text: 'On track', color: S.text },
    behind: { text: 'Behind plan · tap for diagnostic', color: S.red },
    unknown: { text: 'Insufficient data', color: S.mute },
  }

  const clickable = verdict === 'behind'

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
          <button
            onClick={clickable ? onVerdictClick : undefined}
            disabled={!clickable}
            style={{
              marginTop: 10, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 700, color: verdictLabel[verdict].color,
              background: 'transparent', border: 'none', padding: 0, cursor: clickable ? 'pointer' : 'default',
              fontFamily: 'inherit',
              textDecoration: clickable ? 'underline' : 'none',
              textUnderlineOffset: 3,
            }}
          >
            {verdictLabel[verdict].text}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <TrajectoryChart history={history} targets={monthly_targets} target={target_followers} />
        </div>
      </div>

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
        <path d={projectionLine('projection_optimistic')} fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeDasharray="2 3" />
        <path d={projectionLine('projection_realistic')} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeDasharray="4 2" />
        <path d={projectionLine('projection_conservative')} fill="none" stroke="#ffffff" strokeOpacity="0.15" strokeDasharray="2 3" />

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

      <g transform={`translate(${pad.l}, ${height - 4})`} fontSize="9" fill={S.dimmer} style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        <g><rect width="10" height="2" y="-3" fill={S.red} /><text x="14" y="0">actual</text></g>
        <g transform="translate(64,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.5" /><text x="14" y="0">realistic</text></g>
        <g transform="translate(136,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.25" /><text x="14" y="0">optimistic</text></g>
        <g transform="translate(214,0)"><rect width="10" height="1" y="-2" fill="#ffffff" fillOpacity="0.15" /><text x="14" y="0">conservative</text></g>
      </g>
    </svg>
  )
}

// ─── Trajectory drawer (diagnostic for "Behind") ────────────────────────────
function TrajectoryDrawer({
  data,
  onClose,
  onRegenerateStrategy,
}: {
  data: Overview
  onClose: () => void
  onRegenerateStrategy: () => void
}) {
  const firing = data.scaling_rules.filter(r => r.verdict === 'action' || r.verdict === 'warning')
  const pendingCaptures = data.capture_moments.filter(m => !m.content_captured && m.moment_date >= new Date().toISOString().slice(0, 10))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', justifyContent: 'flex-end', zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '100%', background: S.bg,
          borderLeft: `1px solid ${S.borderBright}`,
          padding: '28px 28px 32px', overflowY: 'auto', fontFamily: S.font,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <MiniLabel>Trajectory diagnostic</MiniLabel>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4, color: S.red }}>Why behind plan</div>
          </div>
          <button onClick={onClose} style={{ ...ghostBtn, padding: '4px 12px' }}>Close</button>
        </div>

        <div style={{ fontSize: 11, color: S.dimmer, lineHeight: 1.7, marginBottom: 20 }}>
          Pace is off the realistic projection. Below are the signals feeding that gap and the corrective moves available right now.
        </div>

        <div style={{ marginBottom: 20 }}>
          <MiniLabel>Rules firing</MiniLabel>
          {firing.length === 0 ? (
            <div style={{ fontSize: 12, color: S.dimmer, marginTop: 8 }}>No rules firing. The gap is structural — more spend or more capture needed.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {firing.map(r => (
                <li key={r.id} style={{ padding: '8px 12px', background: S.panelHi, border: `1px solid ${S.border}`, fontSize: 12 }}>
                  <span style={{ color: r.verdict === 'action' ? S.red : S.dim, fontWeight: 700 }}>{r.verdict === 'action' ? 'ACT' : 'WATCH'}</span>
                  <span style={{ color: S.text, marginLeft: 10 }}>{r.label}</span>
                  {r.recommendation && <div style={{ color: S.dimmer, marginTop: 4, fontSize: 11 }}>{r.recommendation}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <MiniLabel>Pending capture ({pendingCaptures.length})</MiniLabel>
          {pendingCaptures.length === 0 ? (
            <div style={{ fontSize: 12, color: S.dimmer, marginTop: 8 }}>No upcoming capture moments pending.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingCaptures.slice(0, 4).map(m => (
                <li key={m.id} style={{ fontSize: 12, color: S.dim, padding: '4px 0' }}>
                  · {new Date(m.moment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {m.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <MiniLabel>This month budget</MiniLabel>
          {(() => {
            const cur = data.monthly_budget.find(m => m.month === new Date().toISOString().slice(0, 7))
            if (!cur) return <div style={{ fontSize: 12, color: S.dimmer, marginTop: 8 }}>No budget set for this month.</div>
            const actual = cur.actual_spend_gbp ?? 0
            const planned = cur.planned_spend_gbp ?? 0
            const underSpend = planned > 0 && actual < planned * 0.7
            return (
              <div style={{ marginTop: 8, fontSize: 12, color: S.dim, lineHeight: 1.7 }}>
                Planned: <BlurredAmount>£{planned.toFixed(0)}</BlurredAmount> · Actual: <BlurredAmount>£{actual.toFixed(2)}</BlurredAmount>
                {underSpend && <div style={{ color: S.red, marginTop: 4 }}>Under-pacing the budget by &gt;30%. Spend is a lever.</div>}
              </div>
            )
          })()}
        </div>

        <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onRegenerateStrategy} style={actionBtn}>Regenerate strategy brief</button>
          <Link href="/grow/ads/planner?campaign_type=always-on&objective=engagement&budget=low&duration=14&format=reel&context=Behind+plan+recovery" style={{ ...actionBtn, textDecoration: 'none', display: 'inline-block' }}>
            Open planner
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Funnel state ───────────────────────────────────────────────────────────
function FunnelCard({
  funnel,
  aggregates,
  onLaunchStage1,
  onLaunchStage2,
}: {
  funnel: Overview['funnel']
  aggregates: Overview['aggregates']
  onLaunchStage1: () => void
  onLaunchStage2: () => void
}) {
  const stage1Empty = funnel.stage_1.campaigns.length === 0
  const stage2CanGo = !funnel.stage_2.active && funnel.stage_1.pool_ready

  return (
    <section style={panel}>
      <SectionTitle>Two-stage funnel</SectionTitle>
      <div style={{ fontSize: 11, color: S.dimmest, marginTop: -8, marginBottom: 14 }}>
        Stage 1 = Engagement (profile-visit → follower) → Stage 2 = Release burst on warm pool
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
            Boost highest-save-rate post · Engagement objective · Global mix
          </div>
          <MetricRow label="Retargeting pool (75%+ viewers)" value={funnel.stage_1.retargeting_pool.toLocaleString()} />
          <MetricRow
            label="Pool threshold"
            value={`${funnel.stage_1.pool_threshold.toLocaleString()}${funnel.stage_1.pool_ready ? ' ✓' : ''}`}
            accent={funnel.stage_1.pool_ready}
          />
          {stage1Empty && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: S.red, letterSpacing: '0.04em' }}>
                No Stage 1 running.
              </div>
              <button
                onClick={onLaunchStage1}
                style={{ ...actionBtn, textAlign: 'center' }}
              >
                Launch Stage 1 →
              </button>
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
          {stage2CanGo && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: S.red, letterSpacing: '0.04em' }}>
                Pool is warm. Next release burst can go.
              </div>
              <button
                onClick={onLaunchStage2}
                style={{ ...actionBtn, textAlign: 'center' }}
              >
                Launch release burst →
              </button>
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

// ─── Monthly budget table (with inline-edit planned) ────────────────────────
function MonthlyBudgetCard({
  budget,
  onUpdatePlanned,
}: {
  budget: MonthlyTarget[]
  onUpdatePlanned: (month: string, planned: number) => Promise<void>
}) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState<string>('')

  const th: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
    color: S.mute, padding: '8px 8px', textAlign: 'left' as const,
    borderBottom: `1px solid ${S.border}`,
  }
  const td: React.CSSProperties = {
    fontSize: 12, padding: '10px 8px', borderBottom: `1px solid ${S.border}`,
    fontVariantNumeric: 'tabular-nums' as const,
  }

  async function commit(month: string) {
    const n = parseFloat(draftValue)
    if (isNaN(n) || n < 0) {
      setEditing(null)
      return
    }
    await onUpdatePlanned(month, n)
    setEditing(null)
  }

  return (
    <section style={panel}>
      <SectionTitle>Monthly budget vs actual</SectionTitle>
      <div style={{ fontSize: 11, color: S.dimmest, marginTop: -8, marginBottom: 14 }}>
        Click a planned value to edit inline.
      </div>
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
              const isEditing = editing === row.month
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
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        value={draftValue}
                        onChange={e => setDraftValue(e.target.value)}
                        onBlur={() => commit(row.month)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commit(row.month)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        style={{
                          width: 70, textAlign: 'right', padding: '2px 6px',
                          background: S.bg, color: S.text, border: `1px solid ${S.red}`,
                          fontFamily: 'inherit', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditing(row.month); setDraftValue(String(planned || 0)) }}
                        style={{
                          background: 'transparent', border: 'none', color: S.dim,
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0,
                          borderBottom: `1px dashed ${S.border}`,
                        }}
                      >
                        <BlurredAmount>£{planned.toFixed(0)}</BlurredAmount>
                      </button>
                    )}
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

// ─── Scaling rules (with Apply button) ──────────────────────────────────────
function ScalingRulesCard({
  rules,
  busyRuleId,
  onApply,
}: {
  rules: ScalingRule[]
  busyRuleId: string | null
  onApply: (rule: ScalingRule) => void
}) {
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

  function actionLabel(rule: ScalingRule): string {
    // Map each rule id to the verb that matches the expected_action.
    switch (rule.id) {
      case 'ctr_scale_up':
      case 'cheap_follower_scale':
        return 'Raise budget'
      case 'vtr_kill':
        return 'Pause'
      case 'freq_swap':
      case 'rotation_due':
        return 'New creative'
      case 'cpm_audience_rotate':
      case 'engagement_lookalike':
        return 'Refresh audience'
      default:
        return 'Apply'
    }
  }

  return (
    <section style={panel}>
      <SectionTitle>Scaling rules — live</SectionTitle>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
        {rules.map(r => {
          const st = verdictStyle[r.verdict]
          const canApply = r.verdict === 'action' && r.expected_action
          const isBusy = busyRuleId === r.id
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
              {canApply && (
                <button
                  onClick={() => onApply(r)}
                  disabled={isBusy}
                  style={{ ...actionBtn, opacity: isBusy ? 0.5 : 1 }}
                >
                  {isBusy ? '…' : actionLabel(r)}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Capture moments (with Upload / Mark captured) ──────────────────────────
function CaptureMomentsCard({
  moments,
  onToggleCaptured,
}: {
  moments: CaptureMoment[]
  onToggleCaptured: (id: string, next: boolean) => Promise<void>
}) {
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
              <MomentRow key={m.id} moment={m} isPast={false} onToggleCaptured={onToggleCaptured} />
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <MiniLabel>Past</MiniLabel>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {past.map(m => (
              <MomentRow key={m.id} moment={m} isPast={true} onToggleCaptured={onToggleCaptured} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function MomentRow({
  moment,
  isPast,
  onToggleCaptured,
}: {
  moment: CaptureMoment
  isPast: boolean
  onToggleCaptured: (id: string, next: boolean) => Promise<void>
}) {
  const d = new Date(moment.moment_date)
  const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const missed = isPast && !moment.content_captured

  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: S.panelHi, border: `1px solid ${missed ? S.redDim : S.border}` }}>
      <div style={{ fontSize: 11, color: S.dimmer, minWidth: 56, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{dateLabel}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: S.text }}>{moment.label}</div>
        {moment.why && <div style={{ fontSize: 11, color: S.dimmer, marginTop: 2 }}>{moment.why}</div>}
      </div>

      {moment.content_captured ? (
        <>
          <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: S.red }}>
            ✓ captured
          </span>
          <button
            onClick={() => {
              if (window.confirm('Mark this moment as NOT captured?')) onToggleCaptured(moment.id, false)
            }}
            style={{ ...ghostBtn, padding: '4px 10px', fontSize: 9 }}
          >
            Undo
          </button>
        </>
      ) : (
        <>
          {missed && (
            <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: S.red }}>
              missed
            </span>
          )}
          {moment.gig_id && (
            <Link
              href={`/upload/${moment.gig_id}`}
              style={{ ...ghostBtn, padding: '4px 10px', fontSize: 9, textDecoration: 'none' }}
            >
              Upload
            </Link>
          )}
          <button
            onClick={() => onToggleCaptured(moment.id, true)}
            style={{ ...actionBtn, padding: '4px 10px', fontSize: 9 }}
          >
            Mark captured
          </button>
        </>
      )}
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
