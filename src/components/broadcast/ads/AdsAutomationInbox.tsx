'use client'

import { useState, useCallback, useEffect } from 'react'

type Verdict = {
  id: string
  campaign_id: string
  meta_campaign_id: string
  rule_id: string
  verdict: 'action' | 'warning' | 'safe' | 'insufficient_data'
  current_value: number | null
  threshold: string | null
  recommendation: string | null
  action_type: 'scale_budget' | 'pause_campaign' | 'swap_creative' | 'propose_stage_2' | null
  action_payload: Record<string, unknown> | null
  evaluated_for_date: string
  applied_at: string | null
  dismissed_at: string | null
  campaigns: { name: string; intent: string | null; status: string } | null
}

const S = {
  red: '#ff2a1a',
  redDim: 'rgba(255,42,26,0.35)',
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

type Props = {
  onLaunchStage2?: (prefillPayload: Record<string, unknown>) => void
  onDirty?: () => void
}

/**
 * AdsAutomationInbox — lists open `action` verdicts from the ads-evaluate cron
 * and lets the user Apply (5-min approval handshake) or Dismiss. Propose_stage_2
 * verdicts route to the parent's launch-modal opener instead of the apply API.
 */
export default function AdsAutomationInbox({ onLaunchStage2, onDirty }: Props) {
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ads/verdicts')
      const body = await res.json().catch(() => ({}))
      if (res.ok) setVerdicts(body.verdicts ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const apply = useCallback(
    async (v: Verdict) => {
      if (v.action_type === 'propose_stage_2') {
        // Stage 2 goes through the launch modal. Mark the verdict applied up
        // top-level so the row clears; actual campaign launch happens inside
        // the modal's own approval flow.
        if (!onLaunchStage2) {
          alert('Stage 2 launch handler not wired — open the Growth dashboard.')
          return
        }
        onLaunchStage2(v.action_payload ?? {})
        // Fire-and-forget apply: marks it acknowledged so the notification clears.
        setBusyId(v.id)
        try {
          await fetch('/api/ads/apply-rule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ verdict_id: v.id, approved_at: new Date().toISOString() }),
          })
          await load()
          onDirty?.()
        } finally {
          setBusyId(null)
        }
        return
      }

      const prompt = confirmPromptFor(v)
      if (!window.confirm(prompt)) return

      setBusyId(v.id)
      try {
        const res = await fetch('/api/ads/apply-rule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verdict_id: v.id, approved_at: new Date().toISOString() }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (body.error === 'creative_queue_empty') {
            alert(
              'No approved creatives in the queue for this campaign.\n\n' +
                'Add + approve one in the Creative queue panel, or Dismiss this verdict.'
            )
          } else if (body.error === 'scale_cooldown') {
            alert(`Scale cooldown — ${body.hint}`)
          } else {
            alert(`Failed: ${body.error || res.statusText}`)
          }
          return
        }
        await load()
        onDirty?.()
      } finally {
        setBusyId(null)
      }
    },
    [load, onDirty, onLaunchStage2]
  )

  const dismiss = useCallback(
    async (v: Verdict) => {
      if (!window.confirm(`Dismiss "${v.recommendation || v.rule_id}"?`)) return
      setBusyId(v.id)
      try {
        const res = await fetch(`/api/ads/apply-rule?verdict_id=${v.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert(`Failed: ${body.error || res.statusText}`)
          return
        }
        await load()
      } finally {
        setBusyId(null)
      }
    },
    [load]
  )

  if (loading) {
    return (
      <section style={panel}>
        <Title>Automation inbox</Title>
        <div style={{ fontSize: 11, color: S.dimmer, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Loading…
        </div>
      </section>
    )
  }

  if (verdicts.length === 0) {
    return (
      <section style={panel}>
        <Title>Automation inbox</Title>
        <div style={{ fontSize: 12, color: S.dimmer }}>
          Nothing queued. The daily cron writes here when a rule fires.
        </div>
      </section>
    )
  }

  return (
    <section style={panel}>
      <Title>Automation inbox · {verdicts.length}</Title>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
        {verdicts.map(v => {
          const isBusy = busyId === v.id
          const isStage2 = v.action_type === 'propose_stage_2'
          const canApply = !!v.action_type
          return (
            <li
              key={v.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 14px',
                background: isStage2 ? 'rgba(255,42,26,0.08)' : 'rgba(255,42,26,0.04)',
                border: `1px solid ${isStage2 ? S.red : S.redDim}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    color: S.red,
                    minWidth: 68,
                  }}
                >
                  {isStage2 ? 'STAGE 2' : 'ACT'}
                </span>
                <span style={{ fontSize: 12, color: S.text, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.campaigns?.name || 'Campaign'} · {humanRule(v.rule_id)}
                </span>
                <span style={{ fontSize: 10, color: S.mute, letterSpacing: '0.1em' }}>
                  {v.evaluated_for_date}
                </span>
              </div>
              {v.recommendation && (
                <div style={{ fontSize: 12, color: S.dimmer, lineHeight: 1.4 }}>
                  {v.recommendation}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                {canApply && (
                  <button
                    onClick={() => apply(v)}
                    disabled={isBusy}
                    style={{
                      padding: '6px 14px',
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      border: `1px solid ${S.red}`,
                      color: S.red,
                      background: 'rgba(255,42,26,0.12)',
                      cursor: isBusy ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 700,
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    {isBusy ? '…' : applyLabel(v)}
                  </button>
                )}
                <button
                  onClick={() => dismiss(v)}
                  disabled={isBusy}
                  style={{
                    padding: '6px 14px',
                    fontSize: 10,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    border: `1px solid ${S.border}`,
                    color: S.dim,
                    background: 'transparent',
                    cursor: isBusy ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 500,
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function humanRule(id: string): string {
  switch (id) {
    case 'ctr_scale_up':
      return 'CTR strong — scale budget'
    case 'cheap_follower_scale':
      return 'Cheap followers — scale 2×'
    case 'vtr_kill':
      return 'Low VTR — kill + rotate'
    case 'freq_swap':
      return 'Fatigue — swap creative'
    case 'rotation_due':
      return 'Rotation due — swap creative'
    case 'cpm_audience_rotate':
      return 'CPM high — rotate audience'
    case 'engagement_lookalike':
      return 'Strong engagement — expand lookalike'
    case 'stage_2_launch':
      return 'Stage 2 ready — launch retargeting'
    default:
      return id
  }
}

function applyLabel(v: Verdict): string {
  switch (v.action_type) {
    case 'scale_budget': {
      const m = Number((v.action_payload ?? {}).multiplier ?? 1)
      return m >= 1.99 ? 'Scale 2×' : `Scale +${Math.round((m - 1) * 100)}%`
    }
    case 'pause_campaign':
      return 'Pause'
    case 'swap_creative':
      return 'Rotate creative'
    case 'propose_stage_2':
      return 'Launch Stage 2'
    default:
      return 'Apply'
  }
}

function confirmPromptFor(v: Verdict): string {
  switch (v.action_type) {
    case 'scale_budget': {
      const m = Number((v.action_payload ?? {}).multiplier ?? 1)
      return `Scale daily budget by ${m.toFixed(2)}× on ${v.campaigns?.name || 'this campaign'}?`
    }
    case 'pause_campaign':
      return `Pause ${v.campaigns?.name || 'this campaign'} on Meta?`
    case 'swap_creative':
      return `Swap to the next queued creative on ${v.campaigns?.name || 'this campaign'}? The current ad will be paused.`
    default:
      return 'Apply this action?'
  }
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: S.dim,
        fontWeight: 700,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}
