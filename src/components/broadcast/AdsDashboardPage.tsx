'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { BlurredAmount } from '@/components/ui/BlurredAmount'
import type { CampaignHealth } from '@/lib/ads/campaign-health'

type AdRanking = 'ABOVE_AVERAGE' | 'AVERAGE' | 'BELOW_AVERAGE_35' | 'BELOW_AVERAGE_20' | 'BELOW_AVERAGE_10' | 'UNKNOWN'

interface CampaignDetails {
  campaign: { id: string; name: string; status: string; objective: string; start_time: string; stop_time: string | null }
  insights: CampaignInsights & { frequency?: string } | null
  daily: { date: string; reach: number; spend: number; impressions: number; cpm: number }[]
  ageGender: { age: string; gender: string; reach: number; impressions: number; spend: number }[]
  placements: { platform: string; position: string; reach: number; impressions: number; spend: number }[]
  countries?: { country: string; reach: number; impressions: number; spend: number; follows: number; visits: number }[]
  regions?: { country: string; region: string; reach: number; impressions: number; spend: number; follows: number; visits: number }[]
  video?: { plays: number; p25: number; p50: number; p75: number; p100: number; avg_time_ms: number } | null
  ads: {
    id: string
    name: string
    status: string
    thumbnail: string | null
    body: string | null
    title: string | null
    insights: {
      spend: number
      reach: number
      impressions: number
      clicks: number
      ctr: number
      cpc: number
      cpm: number
      quality_ranking?: AdRanking
      engagement_rate_ranking?: AdRanking
      conversion_rate_ranking?: AdRanking
    } | null
  }[]
  health: CampaignHealth
}

interface CampaignInsights {
  spend: string
  impressions: string
  reach: string
  clicks: string
  cpc: string
  cpm: string
  ctr: string
  actions?: { action_type: string; value: string }[]
}

interface AdSet {
  name: string
  status: string
  targeting?: {
    age_min?: number
    age_max?: number
    geo_locations?: { cities?: { name: string; radius: number }[] }
    interests?: { name: string }[]
    publisher_platforms?: string[]
  }
}

interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  daily_budget: string | null
  lifetime_budget: string | null
  start_time: string
  stop_time: string | null
  insights: CampaignInsights | null
  adsets: AdSet[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatObjective(obj: string) {
  const map: Record<string, string> = {
    OUTCOME_TRAFFIC: 'Traffic',
    LINK_CLICKS: 'Traffic',
    POST_ENGAGEMENT: 'Engagement',
    OUTCOME_ENGAGEMENT: 'Engagement',
    OUTCOME_AWARENESS: 'Awareness',
    CONVERSIONS: 'Conversions',
  }
  return map[obj] || obj.replace(/_/g, ' ').toLowerCase()
}

export default function AdsDashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'paused' | 'all'>('active')

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ads')
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCampaigns(data.campaigns || [])
      setLastRefresh(new Date())
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
    const interval = setInterval(fetchCampaigns, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchCampaigns])

  async function toggleCampaign(campaignId: string, currentStatus: string) {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    setTogglingId(campaignId)
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to ${newStatus === 'PAUSED' ? 'pause' : 'activate'}`)
      }
      setCampaigns(prev => prev.map(c =>
        c.id === campaignId ? { ...c, status: newStatus } : c
      ))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setTogglingId(null)
    }
  }

  const now = new Date()
  const isLive = (c: Campaign) =>
    c.status === 'ACTIVE' && (!c.stop_time || new Date(c.stop_time) > now)
  const isExpired = (c: Campaign) =>
    c.status === 'ACTIVE' && c.stop_time && new Date(c.stop_time) <= now

  const filtered = campaigns.filter(c => {
    if (filter === 'active') return isLive(c)
    if (filter === 'paused') return c.status === 'PAUSED' || isExpired(c)
    return true
  })

  const activeCampaigns = campaigns.filter(isLive)
  const totalSpend = activeCampaigns.reduce((sum, c) => sum + parseFloat(c.insights?.spend || '0'), 0)
  const totalReach = activeCampaigns.reduce((sum, c) => sum + parseInt(c.insights?.reach || '0'), 0)
  const totalClicks = activeCampaigns.reduce((sum, c) => sum + parseInt(c.insights?.clicks || '0'), 0)
  const avgCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #050505)', color: 'var(--text, #f2f2f2)', fontFamily: "var(--font-mono, 'Helvetica Neue', monospace)" }}>
      <SignalLabHeader />

      <div style={{ padding: '24px 48px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Top bar: refresh + filter ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['active', 'paused', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                border: `1px solid ${filter === f ? 'var(--gold, #ff2a1a)' : 'var(--border, #222)'}`,
                color: filter === f ? 'var(--gold, #ff2a1a)' : 'var(--text-dimmer, #b0b0b0)',
                background: filter === f ? 'rgba(255,42,26,0.08)' : 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{f}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastRefresh && (
              <span style={{ fontSize: 10, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.1em' }}>
                Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={fetchCampaigns} disabled={loading} style={{
              padding: '6px 14px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              border: '1px solid var(--border, #222)', color: 'var(--text-dimmer, #b0b0b0)',
              background: 'transparent', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.4 : 1,
            }}>{loading ? 'Loading...' : 'Refresh'}</button>
            {/* + ONE-OFF BOOST — the sole visible entry point to
                /grow/ads/planner. Renamed from "New campaign" because that
                label collided with the Growth tab's Stage 1/2 launcher (both
                produce "new campaigns" from a user POV). "One-off boost"
                frames it as the non-funnel path: release bursts, ticket
                pushes, experiments — anything outside the follower trajectory
                Growth automates. */}
            <Link href="/grow/ads/planner" style={{
              padding: '6px 14px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              border: '1px solid #ff2a1a', color: '#ff2a1a',
              background: 'rgba(255,42,26,0.08)', textDecoration: 'none', fontFamily: 'inherit',
            }}>+ One-off boost</Link>
          </div>
        </div>

        {/* Explain the Ads vs. Growth split so users don't double-launch or
            assume "+ One-off boost" is the only way in. Ads tab is the
            universal campaign list; Growth tab owns the follower-trajectory
            funnel (Stage 1 cold prospecting → Stage 2 warm retargeting).
            Confirmed launches go live immediately — no second-step activate
            in Meta (policy flipped Apr 19 2026). */}
        <div style={{
          fontSize: 10, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.08em',
          lineHeight: 1.55, marginBottom: 20, maxWidth: 720,
        }}>
          Every Meta campaign tied to this ad account is listed here. Growth
          Stage 1/2 runs from the <strong>Growth</strong> tab; use{' '}
          <strong>+ One-off boost</strong> for releases, ticket pushes, or
          experiments outside the funnel. Confirmed launches go live
          immediately — the in-app preview is the approval gate.
        </div>

        {/* ── Summary cards (active campaigns only) ── */}
        {activeCampaigns.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            <SummaryCard label="Active campaigns" value={String(activeCampaigns.length)} />
            <SummaryCard label="Total spend" value={`\u00A3${totalSpend.toFixed(2)}`} blur />
            <SummaryCard label="Total reach" value={totalReach.toLocaleString()} />
            <SummaryCard label="Avg CPC" value={avgCpc > 0 ? `\u00A3${avgCpc.toFixed(2)}` : '-'} blur />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.25)',
            color: '#ff6b6b', padding: '10px 14px', fontSize: 11, marginBottom: 20,
          }}>{error}</div>
        )}

        {/* ── Loading ── */}
        {loading && campaigns.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)' }}>
              Loading campaigns from Meta...
            </div>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && filtered.length === 0 && (
          <div style={{
            background: 'var(--panel, #0e0e0e)', border: '1px solid var(--border, #222)',
            padding: '48px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-dimmer, #b0b0b0)' }}>
              {filter === 'active' ? 'No active campaigns' : filter === 'paused' ? 'No paused campaigns' : 'No campaigns found'}
            </div>
          </div>
        )}

        {/* ── Campaign list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              toggling={togglingId === campaign.id}
              onToggle={() => toggleCampaign(campaign.id, campaign.status)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, blur }: { label: string; value: string; blur?: boolean }) {
  return (
    <div style={{
      background: 'var(--panel, #0e0e0e)', border: '1px solid var(--border, #222)',
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text, #f2f2f2)' }}>
        {blur ? <BlurredAmount>{value}</BlurredAmount> : value}
      </div>
    </div>
  )
}

function CampaignCard({ campaign, toggling, onToggle }: { campaign: Campaign; toggling: boolean; onToggle: () => void }) {
  const isActive = campaign.status === 'ACTIVE'
  const ins = campaign.insights
  const adset = campaign.adsets?.[0]
  const targeting = adset?.targeting
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<CampaignDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const loadDetails = useCallback(async () => {
    if (details || detailsLoading) return
    setDetailsLoading(true)
    setDetailsError('')
    try {
      const res = await fetch(`/api/ads/${campaign.id}/details`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `API ${res.status}`)
      setDetails(data)
    } catch (err: any) {
      setDetailsError(err.message || 'Failed to load details')
    } finally {
      setDetailsLoading(false)
    }
  }, [campaign.id, details, detailsLoading])

  function handleToggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next) loadDetails()
  }

  return (
    <div style={{
      background: 'var(--panel, #0e0e0e)',
      border: `1px solid ${isActive ? 'rgba(255,42,26,0.25)' : 'var(--border, #222)'}`,
      padding: '20px 24px',
    }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: isActive ? '#44cc66' : 'var(--text-dimmest, #909090)',
            }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{campaign.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.1em' }}>
            <span>{formatObjective(campaign.objective)}</span>
            <span>{formatDate(campaign.start_time)}{campaign.stop_time ? ` \u2014 ${formatDate(campaign.stop_time)}` : ''}</span>
            {campaign.lifetime_budget && <span>Budget: <BlurredAmount>{'\u00A3'}{campaign.lifetime_budget}</BlurredAmount></span>}
            {campaign.daily_budget && <span><BlurredAmount>{'\u00A3'}{campaign.daily_budget}/day</BlurredAmount></span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleToggleExpand} style={{
            padding: '6px 16px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            border: '1px solid var(--border, #222)',
            color: expanded ? 'var(--text, #f2f2f2)' : 'var(--text-dimmer, #b0b0b0)',
            background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          <button onClick={onToggle} disabled={toggling} style={{
            padding: '6px 16px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            border: `1px solid ${isActive ? 'rgba(255,50,50,0.3)' : 'rgba(68,204,102,0.3)'}`,
            color: isActive ? '#ff6b6b' : '#44cc66',
            background: isActive ? 'rgba(255,50,50,0.06)' : 'rgba(68,204,102,0.06)',
            cursor: toggling ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: toggling ? 0.4 : 1,
          }}>
            {toggling ? '...' : isActive ? 'Pause' : 'Activate'}
          </button>
        </div>
      </div>

      {/* ── Metrics row ── */}
      {ins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: targeting ? 16 : 0 }}>
          <MetricCell label="Spend" value={`\u00A3${parseFloat(ins.spend).toFixed(2)}`} blur />
          <MetricCell label="Reach" value={parseInt(ins.reach).toLocaleString()} />
          <MetricCell label="Impressions" value={parseInt(ins.impressions).toLocaleString()} />
          <MetricCell label="Link clicks" value={getActionValue(ins.actions, 'link_click')} />
          <MetricCell label="New followers" value={getFollowActionValue(ins.actions)} />
          <MetricCell label="CPC" value={parseFloat(ins.cpc) > 0 ? `\u00A3${parseFloat(ins.cpc).toFixed(2)}` : '-'} blur />
          <MetricCell label="CPM" value={parseFloat(ins.cpm) > 0 ? `\u00A3${parseFloat(ins.cpm).toFixed(2)}` : '-'} blur />
        </div>
      )}

      {!ins && isActive && (
        <div style={{ fontSize: 11, color: 'var(--text-dimmest, #909090)', fontStyle: 'italic' }}>
          No data yet (campaign may still be in review)
        </div>
      )}

      {/* ── Targeting row ── */}
      {targeting && (
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap',
          fontSize: 10, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.08em',
          paddingTop: 12, borderTop: '1px solid var(--border-dim, #1d1d1d)',
        }}>
          {targeting.geo_locations?.cities?.map((c, i) => (
            <span key={i}>{c.name} {c.radius}km</span>
          ))}
          {targeting.age_min && targeting.age_max && (
            <span>Ages {targeting.age_min}-{targeting.age_max}</span>
          )}
          {targeting.interests && (
            <span>{targeting.interests.map(i => i.name).join(', ')}</span>
          )}
          {targeting.publisher_platforms && (
            <span>{targeting.publisher_platforms.join(', ')}</span>
          )}
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-dim, #1d1d1d)' }}>
          {detailsLoading && (
            <div style={{ fontSize: 11, color: 'var(--text-dimmest, #909090)', textAlign: 'center', padding: '20px 0', letterSpacing: '0.1em' }}>
              Loading deeper read from Meta...
            </div>
          )}
          {detailsError && (
            <div style={{ fontSize: 11, color: '#ff6b6b', padding: '10px 0' }}>{detailsError}</div>
          )}
          {details && <CampaignDetailsPanel details={details} />}
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, blur }: { label: string; value: string; blur?: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', padding: '10px 12px',
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #f2f2f2)' }}>
        {blur ? <BlurredAmount>{value}</BlurredAmount> : value}
      </div>
    </div>
  )
}

function getActionValue(actions: { action_type: string; value: string }[] | undefined, type: string): string {
  if (!actions) return '-'
  const action = actions.find(a => a.action_type === type)
  return action ? action.value : '-'
}

// New-follower attributions. Meta exposes this under a few action_type names
// depending on objective + placement — sum them all so we don't undercount
// when IG and FB buckets arrive split. Only populated for campaigns with a
// follow-type outcome (Engagement / Profile Visits / Awareness w/ IG follow).
function getFollowActionValue(actions: { action_type: string; value: string }[] | undefined): string {
  if (!actions) return '-'
  const total = actions
    .filter(a => a.action_type === 'onsite_conversion.follow' || a.action_type === 'follow' || a.action_type === 'onsite_conversion.ig_follow')
    .reduce((sum, a) => sum + (parseInt(a.value) || 0), 0)
  return total > 0 ? total.toLocaleString() : '-'
}

// ── Drill-down panel ────────────────────────────────────────────────────────

const GRADE_COLOR: Record<CampaignHealth['grade'], { fg: string; bg: string; border: string; label: string }> = {
  strong:      { fg: '#44cc66', bg: 'rgba(68,204,102,0.10)',  border: 'rgba(68,204,102,0.35)',  label: 'Strong' },
  working:     { fg: '#88cc44', bg: 'rgba(136,204,68,0.10)',  border: 'rgba(136,204,68,0.30)',  label: 'Working' },
  watch:       { fg: '#e6b800', bg: 'rgba(230,184,0,0.10)',   border: 'rgba(230,184,0,0.35)',   label: 'Needs attention' },
  weak:        { fg: '#ff6b6b', bg: 'rgba(255,107,107,0.10)', border: 'rgba(255,107,107,0.35)', label: 'Underperforming' },
  too_early:   { fg: '#b0b0b0', bg: 'rgba(255,255,255,0.04)', border: 'var(--border, #222)',    label: 'Too early to tell' },
}

const SIGNAL_COLOR: Record<'good' | 'ok' | 'bad' | 'neutral', string> = {
  good: '#44cc66',
  ok: '#e6b800',
  bad: '#ff6b6b',
  neutral: '#909090',
}

function CampaignDetailsPanel({ details }: { details: CampaignDetails }) {
  const { health, daily, ads, ageGender, placements, countries, regions, video, insights } = details
  const grade = GRADE_COLOR[health.grade]
  const maxReach = Math.max(1, ...daily.map(d => d.reach))

  // Sum follows + visits across countries for top-line attribution
  const totalFollows = (countries || []).reduce((s, c) => s + (c.follows || 0), 0)
  const totalVisits = (countries || []).reduce((s, c) => s + (c.visits || 0), 0)
  const totalSpend = parseFloat(insights?.spend || '0')
  // Cost per follow / per profile visit — only meaningful when we have both.
  const costPerFollow = totalFollows > 0 ? totalSpend / totalFollows : null
  const costPerVisit = totalVisits > 0 ? totalSpend / totalVisits : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Verdict chip ── */}
      <div style={{
        border: `1px solid ${grade.border}`,
        background: grade.bg,
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: grade.fg, fontWeight: 700,
            padding: '3px 10px', border: `1px solid ${grade.border}`,
          }}>{grade.label}</span>
          {health.grade !== 'too_early' && (
            <span style={{ fontSize: 10, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.1em' }}>
              Health score {Math.round(health.score)}/100
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text, #f2f2f2)', marginBottom: 10 }}>
          {health.headline}
        </div>
        {health.nextAction && (
          <div style={{ fontSize: 11, color: 'var(--text-dimmer, #b0b0b0)', letterSpacing: '0.04em' }}>
            <span style={{ color: 'var(--text-dimmest, #909090)', letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 8 }}>Next</span>
            {health.nextAction}
          </div>
        )}
      </div>

      {/* ── Reason grid (plain English signals) ── */}
      {health.reasons.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {health.reasons.map((r, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-dim, #1d1d1d)',
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)' }}>
                  {r.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: SIGNAL_COLOR[r.signal] }}>{r.value}</span>
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--text-dimmer, #b0b0b0)' }}>{r.plain}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Daily reach sparkline ── */}
      {daily.length >= 2 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 10 }}>
            Daily reach
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
            {daily.map((d, i) => (
              <div key={i} title={`${d.date}: ${d.reach.toLocaleString()} reached`} style={{
                flex: 1,
                height: `${Math.max(4, (d.reach / maxReach) * 100)}%`,
                background: 'rgba(255,42,26,0.55)',
                minWidth: 6,
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: 'var(--text-dimmest, #909090)', letterSpacing: '0.08em' }}>
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* ── Per-ad breakdown ── */}
      {ads.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 10 }}>
            Creatives in this campaign
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ads.map(ad => <AdRow key={ad.id} ad={ad} />)}
          </div>
        </div>
      )}

      {/* ── Placement split ── */}
      {placements.length > 0 && (
        <BreakdownBlock
          title="Where people are seeing it"
          rows={placements.map(p => ({
            label: `${formatPlatform(p.platform)}${p.position && p.position !== 'unknown' ? ` \u00B7 ${formatPosition(p.position)}` : ''}`,
            reach: p.reach,
            impressions: p.impressions,
          }))}
        />
      )}

      {/* ── Region/city split ── */}
      {regions && regions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 10 }}>
            Top cities/regions (touring intel)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {regions.slice(0, 12).map((r, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 70px 70px',
                gap: 10,
                alignItems: 'center',
                fontSize: 11,
                padding: '6px 0',
                borderBottom: '1px solid var(--border-dim, #1d1d1d)',
              }}>
                <span style={{ color: 'var(--text, #f2f2f2)' }}>{r.region} <span style={{ color: 'var(--text-dimmest, #909090)' }}>{r.country}</span></span>
                <span style={{ textAlign: 'right', color: 'var(--text-dimmer, #b0b0b0)' }}>{r.reach.toLocaleString()} reach</span>
                <span style={{ textAlign: 'right', color: 'var(--text-dimmer, #b0b0b0)' }}>{r.visits.toLocaleString()} visits</span>
                <span style={{ textAlign: 'right', color: r.follows > 0 ? '#44cc66' : 'var(--text-dimmest, #909090)', fontWeight: r.follows > 0 ? 700 : 400 }}>
                  {r.follows > 0 ? `+${r.follows}` : '—'} follows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Age + gender split ── */}
      {ageGender.length > 0 && (
        <BreakdownBlock
          title="Who's seeing it"
          rows={ageGender.map(ag => ({
            label: `${ag.age} \u00B7 ${formatGender(ag.gender)}`,
            reach: ag.reach,
            impressions: ag.impressions,
          }))}
        />
      )}

      {/* ── Cost per follow / per visit ── */}
      {(costPerFollow !== null || costPerVisit !== null) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {costPerFollow !== null && (
            <div style={{ background: 'rgba(68,204,102,0.06)', border: '1px solid rgba(68,204,102,0.25)', padding: '12px 14px' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 6 }}>Cost per follow</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#44cc66' }}><BlurredAmount>£{costPerFollow.toFixed(2)}</BlurredAmount></div>
              <div style={{ fontSize: 10, color: 'var(--text-dimmer, #b0b0b0)', marginTop: 4 }}>{totalFollows.toLocaleString()} follows · <BlurredAmount>£{totalSpend.toFixed(2)}</BlurredAmount> spend</div>
            </div>
          )}
          {costPerVisit !== null && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim, #1d1d1d)', padding: '12px 14px' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 6 }}>Cost per profile visit</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #f2f2f2)' }}><BlurredAmount>£{costPerVisit.toFixed(2)}</BlurredAmount></div>
              <div style={{ fontSize: 10, color: 'var(--text-dimmer, #b0b0b0)', marginTop: 4 }}>{totalVisits.toLocaleString()} visits</div>
            </div>
          )}
        </div>
      )}

      {/* ── Video hook strength ── */}
      {video && video.plays > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 10 }}>
            Hook strength — how far people watch
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {[
              { label: 'Plays', value: video.plays, pct: 100 },
              { label: '25%', value: video.p25, pct: video.plays > 0 ? (video.p25 / video.plays) * 100 : 0 },
              { label: '50%', value: video.p50, pct: video.plays > 0 ? (video.p50 / video.plays) * 100 : 0 },
              { label: '75%', value: video.p75, pct: video.plays > 0 ? (video.p75 / video.plays) * 100 : 0 },
              { label: '100%', value: video.p100, pct: video.plays > 0 ? (video.p100 / video.plays) * 100 : 0 },
            ].map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim, #1d1d1d)', padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #f2f2f2)' }}>{s.value.toLocaleString()}</div>
                {i > 0 && (
                  <div style={{ fontSize: 9, color: s.pct >= 50 ? '#44cc66' : s.pct >= 25 ? '#e6b800' : '#ff6b6b', marginTop: 2 }}>
                    {s.pct.toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
          {video.avg_time_ms > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dimmer, #b0b0b0)', marginTop: 8 }}>
              Avg watch time: <b style={{ color: 'var(--text, #f2f2f2)' }}>{(video.avg_time_ms / 1000).toFixed(1)}s</b>
            </div>
          )}
        </div>
      )}

      {/* ── Country split + follow attribution ── */}
      {countries && countries.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)' }}>
              Where new fans are coming from
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-dimmer, #b0b0b0)' }}>
              <span><b style={{ color: '#44cc66' }}>{totalFollows.toLocaleString()}</b> follows</span>
              <span><b style={{ color: 'var(--text, #f2f2f2)' }}>{totalVisits.toLocaleString()}</b> profile visits</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...countries].sort((a, b) => (b.follows - a.follows) || (b.reach - a.reach)).slice(0, 10).map(c => (
              <div key={c.country} style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 70px 70px 70px',
                gap: 10,
                alignItems: 'center',
                fontSize: 11,
                padding: '6px 0',
                borderBottom: '1px solid var(--border-dim, #1d1d1d)',
              }}>
                <span style={{ letterSpacing: '0.08em', color: 'var(--text, #f2f2f2)', fontWeight: 600 }}>{c.country}</span>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (c.reach / Math.max(1, ...countries.map(x => x.reach))) * 100)}%`,
                    background: 'rgba(255,42,26,0.55)',
                  }} />
                </div>
                <span style={{ textAlign: 'right', color: 'var(--text-dimmer, #b0b0b0)' }}>{c.reach.toLocaleString()} reach</span>
                <span style={{ textAlign: 'right', color: 'var(--text-dimmer, #b0b0b0)' }}>{c.visits.toLocaleString()} visits</span>
                <span style={{ textAlign: 'right', color: c.follows > 0 ? '#44cc66' : 'var(--text-dimmest, #909090)', fontWeight: c.follows > 0 ? 700 : 400 }}>
                  {c.follows > 0 ? `+${c.follows.toLocaleString()}` : '—'} follows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AdRow({ ad }: { ad: CampaignDetails['ads'][number] }) {
  const ins = ad.insights
  const quality = ins?.quality_ranking
  const qualityColor =
    quality === 'ABOVE_AVERAGE' ? '#44cc66'
    : quality === 'AVERAGE' ? '#e6b800'
    : quality && quality !== 'UNKNOWN' ? '#ff6b6b'
    : '#909090'
  const qualityLabel =
    quality === 'ABOVE_AVERAGE' ? 'Above average'
    : quality === 'AVERAGE' ? 'Average'
    : quality === 'BELOW_AVERAGE_35' ? 'Bottom 35%'
    : quality === 'BELOW_AVERAGE_20' ? 'Bottom 20%'
    : quality === 'BELOW_AVERAGE_10' ? 'Bottom 10%'
    : quality === 'UNKNOWN' ? 'Not enough data'
    : 'No data'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border-dim, #1d1d1d)',
      padding: 10,
    }}>
      {ad.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.thumbnail} alt={ad.name} style={{ width: 56, height: 56, objectFit: 'cover', background: '#000' }} />
      ) : (
        <div style={{ width: 56, height: 56, background: '#0a0a0a', border: '1px solid var(--border, #222)' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #f2f2f2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ad.name}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-dimmer, #b0b0b0)', letterSpacing: '0.06em' }}>
          {ins && <span>Reach <strong style={{ color: 'var(--text, #f2f2f2)' }}>{ins.reach.toLocaleString()}</strong></span>}
          {ins && ins.ctr > 0 && <span>CTR <strong style={{ color: 'var(--text, #f2f2f2)' }}>{ins.ctr.toFixed(2)}%</strong></span>}
          {ins && ins.cpm > 0 && <span>CPM <BlurredAmount>{`£${ins.cpm.toFixed(2)}`}</BlurredAmount></span>}
        </div>
      </div>
      <div style={{
        fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: qualityColor, padding: '4px 8px',
        border: `1px solid ${qualityColor}44`,
        whiteSpace: 'nowrap',
      }}>
        {qualityLabel}
      </div>
    </div>
  )
}

function BreakdownBlock({ title, rows }: { title: string; rows: { label: string; reach: number; impressions: number }[] }) {
  const aggregated = aggregateRows(rows)
  const max = Math.max(1, ...aggregated.map(r => r.reach))
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmest, #909090)', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {aggregated.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
            <span style={{ width: 140, color: 'var(--text-dimmer, #b0b0b0)' }}>{r.label}</span>
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.04)', position: 'relative' }}>
              <div style={{ width: `${(r.reach / max) * 100}%`, height: '100%', background: 'rgba(255,42,26,0.45)' }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', color: 'var(--text, #f2f2f2)', fontWeight: 600 }}>
              {r.reach.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function aggregateRows(rows: { label: string; reach: number; impressions: number }[]) {
  const map = new Map<string, { label: string; reach: number; impressions: number }>()
  for (const r of rows) {
    const existing = map.get(r.label)
    if (existing) {
      existing.reach += r.reach
      existing.impressions += r.impressions
    } else {
      map.set(r.label, { ...r })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.reach - a.reach)
}

function formatPlatform(p: string) {
  if (p === 'facebook') return 'Facebook'
  if (p === 'instagram') return 'Instagram'
  if (p === 'audience_network') return 'Audience Network'
  if (p === 'messenger') return 'Messenger'
  return p
}

function formatPosition(p: string) {
  if (p === 'feed') return 'Feed'
  if (p === 'story') return 'Stories'
  if (p === 'reels') return 'Reels'
  if (p === 'instream_video') return 'In-stream'
  if (p === 'explore') return 'Explore'
  if (p === 'facebook_reels') return 'FB Reels'
  return p.replace(/_/g, ' ')
}

function formatGender(g: string) {
  if (g === 'male') return 'Men'
  if (g === 'female') return 'Women'
  return g
}
