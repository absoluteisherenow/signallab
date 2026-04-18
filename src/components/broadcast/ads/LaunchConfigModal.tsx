'use client'

import { useState } from 'react'
import type { LaunchInput, LaunchPreview, MetaObjective, LaunchIntent } from '@/lib/ads/meta-launch'

type PrefillInput = {
  objective?: MetaObjective
  intent?: LaunchIntent
  name?: string
  age_min?: number
  age_max?: number
  duration_days?: number
  phase_label?: string
  hypothesis?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onLaunched?: (campaignId: string) => void
  prefill?: PrefillInput
}

/**
 * LaunchConfigModal — bridge between strategic planner output and Meta-spec
 * launch input. Collects structured fields the planner's text-based AdPlan
 * can't provide (exact budget £, IG post ID, countries, age range).
 *
 * Flow:
 *   1. Configure → user fills fields
 *   2. Preview  → /api/ads/launch/preview returns summary + Meta payloads
 *   3. Approve  → window.confirm + /api/ads/launch with approved_at + hash
 *   4. Done     → Meta resources created PAUSED; user activates in dashboard
 */
export default function LaunchConfigModal({ open, onClose, onLaunched, prefill }: Props) {
  const [step, setStep] = useState<'configure' | 'preview' | 'launching' | 'done' | 'error'>('configure')
  const [name, setName] = useState(prefill?.name ?? '')
  const [objective, setObjective] = useState<MetaObjective>(prefill?.objective ?? 'OUTCOME_ENGAGEMENT')
  const [intent, setIntent] = useState<LaunchIntent>(prefill?.intent ?? 'boost')
  const [phaseLabel, setPhaseLabel] = useState(prefill?.phase_label ?? '')
  const [dailyBudget, setDailyBudget] = useState<number>(5)
  const [durationDays, setDurationDays] = useState<number>(prefill?.duration_days ?? 7)
  const [countries, setCountries] = useState('GB')
  const [ageMin, setAgeMin] = useState(prefill?.age_min ?? 22)
  const [ageMax, setAgeMax] = useState(prefill?.age_max ?? 45)
  const [interestsRaw, setInterestsRaw] = useState('')
  const [igPostId, setIgPostId] = useState('')
  const [hypothesis, setHypothesis] = useState(prefill?.hypothesis ?? '')
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState<LaunchPreview | null>(null)
  const [previewHash, setPreviewHash] = useState<string | null>(null)
  const [launchInput, setLaunchInput] = useState<LaunchInput | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successCampaignId, setSuccessCampaignId] = useState<string | null>(null)

  if (!open) return null

  function buildLaunchInput(): LaunchInput {
    const interestList = interestsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(name => ({ id: name, name })) // Meta interest ID lookup not done here; user must paste IDs or Meta will reject

    return {
      name: name || `${intent} — ${new Date().toISOString().slice(0, 10)}`,
      objective,
      intent,
      phase_label: phaseLabel || undefined,
      daily_budget_gbp: dailyBudget,
      duration_days: durationDays,
      targeting: {
        geo_locations: {
          countries: countries
            .split(',')
            .map(c => c.trim().toUpperCase())
            .filter(Boolean),
        },
        age_min: ageMin,
        age_max: ageMax,
        interests: interestList.length > 0 ? interestList : undefined,
      },
      creative: {
        type: 'existing_ig_post',
        ig_post_id: igPostId,
      },
      hypothesis: hypothesis || undefined,
      notes: notes || undefined,
    }
  }

  async function runPreview() {
    setErrorMsg('')
    const input = buildLaunchInput()

    // Client-side validation
    if (!input.creative.type || input.creative.type !== 'existing_ig_post' || !(input.creative as { ig_post_id: string }).ig_post_id) {
      setErrorMsg('IG post ID required (paste the media ID you want to boost).')
      return
    }
    if (!dailyBudget || dailyBudget < 1) {
      setErrorMsg('Daily budget must be at least £1.')
      return
    }
    if (!input.targeting.geo_locations.countries.length) {
      setErrorMsg('At least one country required.')
      return
    }

    try {
      const res = await fetch('/api/ads/launch/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        setErrorMsg(body.error || `preview failed: ${res.status}`)
        return
      }
      setPreview(body.preview)
      setLaunchInput(input)

      // Compute hash for approval gate
      const canonical = JSON.stringify(input, Object.keys(input).sort())
      const buf = new TextEncoder().encode(canonical)
      const hash = await crypto.subtle.digest('SHA-256', buf)
      const hex = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      setPreviewHash(hex)

      setStep('preview')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'preview failed')
    }
  }

  async function runLaunch() {
    if (!launchInput || !previewHash || !preview) return

    const ok = window.confirm(
      `Launch "${preview.summary.name}" to Meta?\n\n` +
        `${preview.summary.budget_line}\n` +
        `${preview.summary.audience_line}\n` +
        `${preview.summary.creative_line}\n\n` +
        `Meta resources will be created PAUSED. You'll do one final activate click in the dashboard.`
    )
    if (!ok) return

    setStep('launching')
    setErrorMsg('')

    try {
      const res = await fetch('/api/ads/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...launchInput,
          approved_at: new Date().toISOString(),
          preview_hash: previewHash,
        }),
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        setErrorMsg(body.error + (body.detail ? ` — ${body.detail}` : ''))
        setStep('error')
        return
      }
      setSuccessCampaignId(body.campaign?.id ?? null)
      setStep('done')
      if (body.campaign?.id && onLaunched) onLaunched(body.campaign.id)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'launch failed')
      setStep('error')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f0f0f',
          border: '1px solid #2a2a2a',
          maxWidth: 640,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#f2f2f2',
          fontSize: 13,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#888' }}>Launch to Meta</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>
              {step === 'configure' && 'Configure campaign'}
              {step === 'preview' && 'Review before launch'}
              {step === 'launching' && 'Launching…'}
              {step === 'done' && 'Launched'}
              {step === 'error' && 'Launch failed'}
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          {step === 'configure' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Campaign name">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Always-on Stage 1 — week 1" style={inputStyle} />
              </Field>

              <Row>
                <Field label="Objective">
                  <select value={objective} onChange={e => setObjective(e.target.value as MetaObjective)} style={inputStyle}>
                    <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                    <option value="OUTCOME_AWARENESS">Awareness / Video Views</option>
                    <option value="OUTCOME_TRAFFIC">Traffic</option>
                    <option value="OUTCOME_LEADS">Leads</option>
                  </select>
                </Field>
                <Field label="Intent">
                  <select value={intent} onChange={e => setIntent(e.target.value as LaunchIntent)} style={inputStyle}>
                    <option value="growth_stage_1">Growth — Stage 1 (cold reach)</option>
                    <option value="growth_stage_2">Growth — Stage 2 (retarget)</option>
                    <option value="boost">Post boost</option>
                    <option value="release_burst">Release burst</option>
                    <option value="retarget">Retarget</option>
                    <option value="ticket_sales">Ticket sales</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </Row>

              <Field label="Phase label (optional — for Results page grouping)">
                <input value={phaseLabel} onChange={e => setPhaseLabel(e.target.value)} placeholder="e.g. follower_growth_month_1" style={inputStyle} />
              </Field>

              <Row>
                <Field label="Daily budget (£)">
                  <input type="number" min={1} step={0.5} value={dailyBudget} onChange={e => setDailyBudget(Number(e.target.value))} style={inputStyle} />
                </Field>
                <Field label="Duration (days)">
                  <input type="number" min={1} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))} style={inputStyle} />
                </Field>
              </Row>

              <Row>
                <Field label="Countries (ISO codes, comma-separated)">
                  <input value={countries} onChange={e => setCountries(e.target.value)} placeholder="GB, IE, NL" style={inputStyle} />
                </Field>
              </Row>

              <Row>
                <Field label="Age min">
                  <input type="number" min={18} max={65} value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} style={inputStyle} />
                </Field>
                <Field label="Age max">
                  <input type="number" min={18} max={65} value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} style={inputStyle} />
                </Field>
              </Row>

              <Field label="Interest IDs (comma-separated — Meta rejects free-text; paste IDs from Ads Manager)">
                <input value={interestsRaw} onChange={e => setInterestsRaw(e.target.value)} placeholder="e.g. 6003020834693, 6003107902433" style={inputStyle} />
              </Field>

              <Field label="Instagram post ID to boost">
                <input value={igPostId} onChange={e => setIgPostId(e.target.value)} placeholder="e.g. 17945123456789012" style={inputStyle} />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Find this on Instagram: … → Insights → top-right share → "Copy media ID", or Meta Ads Manager.
                </div>
              </Field>

              <Field label="Hypothesis (what you're testing)">
                <textarea value={hypothesis} onChange={e => setHypothesis(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="e.g. Live set clips at UK RA audience convert at <£0.50/follower" />
              </Field>

              <Field label="Notes (optional)">
                <input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} />
              </Field>

              {errorMsg && <div style={{ color: '#ff4444', fontSize: 12 }}>{errorMsg}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={btnGhost}>Cancel</button>
                <button onClick={runPreview} style={btnPrimary}>Preview →</button>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#1a1a1a', padding: 16, border: '1px solid #2a2a2a' }}>
                <Line k="Name" v={preview.summary.name} />
                <Line k="Objective" v={preview.summary.objective} />
                <Line k="Intent" v={preview.summary.intent} />
                <Line k="Budget" v={preview.summary.budget_line} />
                <Line k="Audience" v={preview.summary.audience_line} />
                <Line k="Creative" v={preview.summary.creative_line} />
                <Line k="Estimated max spend" v={<BlurredInline>£{preview.summary.estimated_spend_gbp.toFixed(2)}</BlurredInline>} />
              </div>

              {preview.warnings.length > 0 && (
                <div style={{ background: '#2a1a1a', border: '1px solid #5a2a2a', padding: 12, fontSize: 12 }}>
                  <div style={{ color: '#ffaa66', marginBottom: 6 }}>Warnings</div>
                  {preview.warnings.map((w, i) => (
                    <div key={i} style={{ color: '#eeaa88' }}>· {w}</div>
                  ))}
                </div>
              )}

              <details style={{ fontSize: 11, color: '#888' }}>
                <summary style={{ cursor: 'pointer' }}>Show raw Meta payloads (audit)</summary>
                <pre style={{ fontSize: 10, color: '#aaa', background: '#0a0a0a', padding: 12, overflowX: 'auto', marginTop: 8 }}>
                  {JSON.stringify(preview.meta_payloads, null, 2)}
                </pre>
              </details>

              <div style={{ fontSize: 12, color: '#888', background: '#141414', padding: 10, border: '1px solid #222' }}>
                Launching creates campaign + adset + ad on Meta, all <strong>PAUSED</strong>.
                You do one final activate click in the dashboard afterwards. Nothing spends until then.
              </div>

              {errorMsg && <div style={{ color: '#ff4444', fontSize: 12 }}>{errorMsg}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button onClick={() => setStep('configure')} style={btnGhost}>← Back</button>
                <button onClick={runLaunch} style={btnPrimary}>Approve &amp; Launch</button>
              </div>
            </div>
          )}

          {step === 'launching' && (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Creating Meta resources…</div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ color: '#44cc66', fontSize: 14 }}>Campaign created on Meta.</div>
              <div style={{ fontSize: 12, color: '#bbb' }}>
                All resources are PAUSED. Head to the Ads dashboard to do one final activate click — nothing spends until you activate.
              </div>
              {successCampaignId && (
                <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>DB id: {successCampaignId}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={btnPrimary}>Done</button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ color: '#ff4444', fontSize: 13 }}>Launch failed</div>
              <div style={{ fontSize: 12, color: '#eeaa88', background: '#2a1a1a', border: '1px solid #5a2a2a', padding: 12 }}>
                {errorMsg || 'Unknown error'}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button onClick={() => setStep('configure')} style={btnGhost}>← Back to configure</button>
                <button onClick={onClose} style={btnGhost}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Inline subcomponents (keep modal self-contained) ───────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 120, color: '#888' }}>{k}</span>
      <span style={{ color: '#f2f2f2', flex: 1 }}>{v}</span>
    </div>
  )
}

function BlurredInline({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      onClick={() => setRevealed(r => !r)}
      style={{
        filter: revealed ? 'none' : 'blur(6px)',
        cursor: 'pointer',
        userSelect: revealed ? 'auto' : 'none',
        transition: 'filter 0.2s',
      }}
      title={revealed ? 'Click to hide' : 'Click to reveal'}
    >
      {children}
    </span>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#141414',
  border: '1px solid #2a2a2a',
  padding: '10px 12px',
  color: '#f2f2f2',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  background: '#ff2a1a',
  color: '#000',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 700,
}

const btnGhost: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  background: 'transparent',
  color: '#888',
  border: '1px solid #2a2a2a',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
