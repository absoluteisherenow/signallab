'use client'

// Brain verdict card. Shows invariant pass/fail + derived confidence + red-team
// findings + (for high-stakes tasks) the chairman's council call. Surfaces
// BEFORE the publish/approve button so Anthony sees risk flags before shipping.
//
// Fetch strategy: auto-runs once as soon as a caption is ready so the publish
// CTA isn't silently blocked behind an un-run check. A debounce keeps
// re-typing from re-firing the red-team + council fan-out. `Re-check` button
// is still there for explicit re-runs after edits.

import { useEffect, useRef, useState } from 'react'

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

interface Grounding {
  collaborators?: string[] | null
  userTagHandles?: string[] | null
  firstComment?: string | null
  hashtags?: string[] | null
}

interface Props {
  output: string
  task: string
  /** Show only when the parent is ready for a verdict (e.g. caption chosen). */
  visible: boolean
  /** Called with the verdict once it arrives — parent can gate its publish CTA. */
  onVerdict?: (verdict: Verdict | null) => void
  /** User-attached facts. The red-team treats anything here as confirmed so
   *  collaborator names / venues / handles don't get flagged as fabricated. */
  grounding?: Grounding
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
  const { output, task, visible, onVerdict, grounding } = props
  const groundingKey = JSON.stringify(grounding || {})
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
        body: JSON.stringify({ output, task, grounding }),
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
  }, [output, task, groundingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run the check shortly after the caption settles so the publish CTA
  // isn't silently blocked. Debounced so edits don't fan-out the council on
  // every keystroke. Re-fires once per (output, task) pair.
  const lastAutoKey = useRef<string>('')
  useEffect(() => {
    if (!visible || !output || !task || loading) return
    const key = `${task}::${output}::${groundingKey}`
    if (lastAutoKey.current === key) return
    const t = setTimeout(() => {
      if (lastAutoKey.current === key) return
      lastAutoKey.current = key
      run()
    }, 900)
    return () => clearTimeout(t)
  }, [visible, output, task, loading, groundingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null

  const fails = (verdict?.invariants || []).filter((i) => !i.passed)
  const hardFails = fails.filter((i) => i.severity === 'hard_block')
  const softFails = fails.filter((i) => i.severity === 'soft_flag')
  const conf = verdict ? Math.round(verdict.confidence * 100) : 0
  const clean = !!verdict && !hardFails.length && !softFails.length && !verdict.abstain
  const holding = !!verdict && (hardFails.length > 0 || verdict.abstain)
  const ringColor = verdict ? confColor(verdict.confidence) : BRT.dim

  // Circular confidence ring geometry
  const RING_R = 36
  const RING_CIRC = 2 * Math.PI * RING_R
  const ringOffset = RING_CIRC * (1 - (verdict ? verdict.confidence : 0))

  return (
    <div
      style={{
        border: `1px solid ${clean ? BRT.ok : holding ? BRT.red : BRT.border}`,
        background: clean
          ? 'linear-gradient(180deg, rgba(122,255,158,0.05) 0%, rgba(10,10,10,0.5) 60%)'
          : holding
          ? 'linear-gradient(180deg, rgba(255,42,26,0.06) 0%, rgba(10,10,10,0.5) 60%)'
          : 'rgba(10,10,10,0.5)',
        padding: 16,
        marginTop: 16,
        fontFamily: 'monospace',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 240ms ease, background 240ms ease',
      }}
    >
      <style>{`
        @keyframes bv_ring_in { from { stroke-dashoffset: ${RING_CIRC}; } to { stroke-dashoffset: ${ringOffset}; } }
        @keyframes bv_stamp_in { 0% { opacity: 0; transform: translateY(4px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bv_scan { 0% { transform: translateY(-10%); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(110%); opacity: 0; } }
        .bv-ring-path { animation: bv_ring_in 900ms cubic-bezier(.2,.8,.2,1) both; }
        .bv-stamp { animation: bv_stamp_in 420ms cubic-bezier(.2,.8,.2,1) both; }
        .bv-scan { position: absolute; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, ${ringColor}66, transparent); animation: bv_scan 1400ms ease-in-out; pointer-events: none; }
      `}</style>
      {verdict ? <div className="bv-scan" /> : null}
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
          <div className="bv-stamp" style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16 }}>
            <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
              <circle cx={44} cy={44} r={RING_R} fill="none" stroke="#1a1a1a" strokeWidth={6} />
              <circle
                cx={44}
                cy={44}
                r={RING_R}
                fill="none"
                stroke={ringColor}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringOffset}
                className="bv-ring-path"
                transform="rotate(-90 44 44)"
              />
              <text
                x={44}
                y={46}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="inherit"
                fontSize={22}
                fontWeight={700}
                fill={ringColor}
              >
                {conf}
              </text>
              <text
                x={44}
                y={62}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="inherit"
                fontSize={8}
                letterSpacing={1.4}
                fill={BRT.dim}
              >
                /100
              </text>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  background: clean ? 'rgba(122,255,158,0.1)' : holding ? 'rgba(255,42,26,0.1)' : 'rgba(255,181,70,0.1)',
                  border: `1px solid ${clean ? BRT.ok : holding ? BRT.red : BRT.warn}`,
                  color: clean ? BRT.ok : holding ? BRT.red : BRT.warn,
                  fontSize: 11,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: clean ? BRT.ok : holding ? BRT.red : BRT.warn,
                    boxShadow: `0 0 8px ${clean ? BRT.ok : holding ? BRT.red : BRT.warn}`,
                  }}
                />
                {clean ? 'Clear to ship' : holding ? 'Hold — needs review' : 'Soft flags'}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: BRT.dim, letterSpacing: '0.04em', lineHeight: 1.4 }}>
                {clean
                  ? 'All invariants passed. Red-team clean. You can publish with confidence.'
                  : holding
                  ? `${hardFails.length} hard block${hardFails.length === 1 ? '' : 's'} — fix before publishing, or override if you've reviewed.`
                  : `${softFails.length} soft flag${softFails.length === 1 ? '' : 's'} — review but not blocking.`}
              </div>
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

          {/* Clean state is already communicated by the hero stamp; no duplicate footer. */}

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
          platform + scans for fabrications, voice tells, and narrative-thread contradictions.
        </div>
      ) : null}
    </div>
  )
}
