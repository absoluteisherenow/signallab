'use client'

// Brain verdict card. Shows invariant pass/fail + derived confidence + red-team
// findings + (for high-stakes tasks) the chairman's council call. Surfaces
// BEFORE the publish/approve button so Anthony sees risk flags before shipping.
//
// Fetch strategy: on-demand via a "Check" button (not auto-fired), because the
// red-team pass + council advisor fan-out aren't free and we don't want to
// re-run them on every keystroke. Re-runs automatically when `output` changes
// IF the card was already open (user explicitly asked for a check and is
// editing live).

import { useEffect, useState } from 'react'

type Severity = 'hard_block' | 'soft_flag' | 'advisory' | 'auto_fix'

interface Invariant {
  rule_slug: string
  severity: Severity
  passed: boolean
  detail?: string | null
}

interface CouncilAdvisor {
  key: string
  text: string
}

interface Council {
  question: string
  advisors: CouncilAdvisor[]
  chairman: string
}

interface Verdict {
  ok: true
  task: string
  confidence: number
  abstain_threshold: number
  abstain: boolean
  invariants: Invariant[]
  redTeam: Invariant | null
  council: Council | null
}

interface Props {
  output: string
  task: string
  /** Show only when the parent is ready for a verdict (e.g. caption chosen). */
  visible: boolean
  /** Called with the verdict once it arrives — parent can gate its publish CTA. */
  onVerdict?: (verdict: Verdict | null) => void
}

const BRT = {
  bg: '#000',
  ink: '#f2f2f2',
  border: '#1a1a1a',
  borderBright: '#2a2a2a',
  dim: '#6a6a6a',
  red: '#ff2a1a',
  warn: '#ffb546',
  ok: '#7aff9e',
}

function sevColor(sev: Severity, passed: boolean): string {
  if (passed) return BRT.ok
  if (sev === 'hard_block') return BRT.red
  if (sev === 'soft_flag') return BRT.warn
  return BRT.dim
}

function confColor(c: number): string {
  if (c >= 0.8) return BRT.ok
  if (c >= 0.6) return BRT.warn
  return BRT.red
}

export function BrainVerdictCard(props: Props) {
  const { output, task, visible, onVerdict } = props
  const [loading, setLoading] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const [councilOpen, setCouncilOpen] = useState(false)

  async function run() {
    if (!output || !task) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/brain/verdict', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ output, task }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        setVerdict(null)
        onVerdict?.(null)
        return
      }
      setVerdict(data)
      onVerdict?.(data)
    } catch (e: any) {
      setError(e?.message || 'verdict failed')
    } finally {
      setLoading(false)
    }
  }

  // Clear stale verdict when the output changes so the UI doesn't show a
  // verdict that belongs to the previous version of the caption.
  useEffect(() => {
    setVerdict(null)
    onVerdict?.(null)
    setCouncilOpen(false)
  }, [output, task]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null

  const fails = (verdict?.invariants || []).filter((i) => !i.passed)
  const hardFails = fails.filter((i) => i.severity === 'hard_block')
  const softFails = fails.filter((i) => i.severity === 'soft_flag')

  return (
    <div
      style={{
        border: `1px solid ${BRT.border}`,
        background: 'rgba(10,10,10,0.5)',
        padding: 16,
        marginTop: 16,
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: BRT.red,
          }}
        >
          Brain verdict
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {verdict ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background: 'transparent',
                border: `1px solid ${BRT.border}`,
                color: BRT.dim,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                padding: '6px 10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
          <button
            onClick={run}
            disabled={loading || !output}
            style={{
              background: loading ? 'transparent' : 'rgba(255,42,26,0.08)',
              border: `1px solid ${BRT.red}`,
              color: loading ? BRT.dim : BRT.red,
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '6px 12px',
              cursor: loading || !output ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Running…' : verdict ? 'Re-check' : 'Check'}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ color: BRT.red, fontSize: 12, marginTop: 10 }}>{error}</div>
      ) : null}

      {verdict ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: BRT.dim, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                Confidence
              </div>
              <div style={{ fontSize: 24, color: confColor(verdict.confidence), fontWeight: 600 }}>
                {Math.round(verdict.confidence * 100)}
                <span style={{ fontSize: 12, color: BRT.dim, marginLeft: 3 }}>/100</span>
              </div>
            </div>
            <div style={{ flex: 1, height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.round(verdict.confidence * 100)}%`,
                  height: '100%',
                  background: confColor(verdict.confidence),
                }}
              />
            </div>
          </div>

          {verdict.abstain ? (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                background: 'rgba(255,42,26,0.08)',
                border: `1px solid ${BRT.red}`,
                color: BRT.red,
                fontSize: 11,
                letterSpacing: '0.08em',
              }}
            >
              Low-confidence draft ({Math.round(verdict.confidence * 100)} &lt;{' '}
              {Math.round(verdict.abstain_threshold * 100)}). Review flags before publishing.
            </div>
          ) : null}

          {hardFails.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: BRT.red, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
                Hard blocks · {hardFails.length}
              </div>
              {hardFails.map((f) => (
                <div key={f.rule_slug} style={{ fontSize: 11, color: BRT.red, marginBottom: 2 }}>
                  × {f.rule_slug}
                  {f.detail ? <span style={{ color: BRT.dim }}> — {f.detail}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          {softFails.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: BRT.warn, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
                Soft flags · {softFails.length}
              </div>
              {softFails.map((f) => (
                <div key={f.rule_slug} style={{ fontSize: 11, color: BRT.warn, marginBottom: 2 }}>
                  ! {f.rule_slug}
                  {f.detail ? <span style={{ color: BRT.dim }}> — {f.detail}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          {!hardFails.length && !softFails.length ? (
            <div style={{ marginTop: 12, fontSize: 11, color: BRT.ok, letterSpacing: '0.08em' }}>
              All checks clean.
            </div>
          ) : null}

          {verdict.redTeam && !verdict.redTeam.passed ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: BRT.warn, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
                Red-team concerns
              </div>
              <div style={{ fontSize: 11, color: BRT.ink, whiteSpace: 'pre-wrap' }}>
                {verdict.redTeam.detail || '(no detail)'}
              </div>
            </div>
          ) : null}

          {verdict.council ? (
            <div style={{ marginTop: 14, borderTop: `1px solid ${BRT.border}`, paddingTop: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setCouncilOpen((v) => !v)}
              >
                <div style={{ fontSize: 10, color: BRT.red, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                  Council · chairman
                </div>
                <div style={{ fontSize: 10, color: BRT.dim }}>{councilOpen ? 'hide' : 'show'}</div>
              </div>
              <div style={{ fontSize: 11, color: BRT.ink, marginTop: 8, whiteSpace: 'pre-wrap' }}>
                {verdict.council.chairman}
              </div>
              {councilOpen ? (
                <div style={{ marginTop: 12 }}>
                  {verdict.council.advisors.map((a) => (
                    <details key={a.key} style={{ marginBottom: 8 }}>
                      <summary
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.2em',
                          textTransform: 'uppercase',
                          color: BRT.dim,
                          cursor: 'pointer',
                        }}
                      >
                        {a.key}
                      </summary>
                      <div style={{ fontSize: 11, color: BRT.ink, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                        {a.text}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {expanded ? (
            <div style={{ marginTop: 14, borderTop: `1px solid ${BRT.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 10, color: BRT.dim, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
                All invariants · {verdict.invariants.length}
              </div>
              {verdict.invariants.map((i) => (
                <div key={i.rule_slug} style={{ fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: sevColor(i.severity, i.passed), marginRight: 6 }}>
                    {i.passed ? '✓' : '×'}
                  </span>
                  <span style={{ color: BRT.ink }}>{i.rule_slug}</span>
                  <span style={{ color: BRT.dim, marginLeft: 8 }}>· {i.severity}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : !loading ? (
        <div style={{ fontSize: 11, color: BRT.dim, marginTop: 10 }}>
          Run a brain check before publishing. Validates against every active rule for this
          platform + scans for fabrications, AI tells, and narrative-thread contradictions.
        </div>
      ) : null}
    </div>
  )
}
