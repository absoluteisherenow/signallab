'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

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

      {/* ── Metrics row ── */}
      {ins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, marginBottom: targeting ? 16 : 0 }}>
          <MetricCell label="Spend" value={`\u00A3${parseFloat(ins.spend).toFixed(2)}`} blur />
          <MetricCell label="Reach" value={parseInt(ins.reach).toLocaleString()} />
          <MetricCell label="Impressions" value={parseInt(ins.impressions).toLocaleString()} />
          <MetricCell label="Link clicks" value={getActionValue(ins.actions, 'link_click')} />
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
