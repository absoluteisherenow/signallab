'use client'

import { useState, useEffect } from 'react'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { SKILL_ADS_MANAGER } from '@/lib/skillPromptsClient'

interface AdPlan {
  campaign_type: string
  objective: string
  platforms: { name: string; budget_split: string; why: string; format_rec: string }[]
  audiences: { layer: string; targeting: string; size: string }[]
  creative: string[]
  schedule: string
  budget_breakdown: string
  ab_tests: string[]
  red_flags: string[]
  green_flags: string[]
  estimated_reach: string
  cost_per_result: string
}

async function callClaude(system: string, userPrompt: string, maxTokens = 1200): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error ${res.status}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

const OBJECTIVES = [
  { id: 'awareness', label: 'Awareness', desc: 'Get seen by new people' },
  { id: 'traffic', label: 'Traffic', desc: 'Drive to link / pre-save' },
  { id: 'engagement', label: 'Engagement', desc: 'Likes, comments, shares' },
  { id: 'followers', label: 'Followers', desc: 'Grow your audience' },
  { id: 'conversions', label: 'Conversions', desc: 'Tickets, merch, streams' },
] as const

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
] as const

export default function AdsPage() {
  const [artistName, setArtistName] = useState('')
  const [campaignType, setCampaignType] = useState<'release' | 'gig' | 'always-on'>('release')
  const [objective, setObjective] = useState('awareness')
  const [budget, setBudget] = useState<'micro' | 'low' | 'mid' | 'high' | 'premium'>('low')
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['instagram'])
  const [format, setFormat] = useState<'reel' | 'story' | 'carousel' | 'static'>('reel')
  const [caption, setCaption] = useState('')
  const [context, setContext] = useState('')
  const [duration, setDuration] = useState<'3' | '7' | '14' | '30'>('7')
  const [location, setLocation] = useState('')
  const [ageRange, setAgeRange] = useState('18-44')
  const [interests, setInterests] = useState('')
  const [adPlan, setAdPlan] = useState<AdPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [savedPlans, setSavedPlans] = useState<Array<{ id: string; name: string; date: string; plan: AdPlan }>>([])
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    // Load artist name
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.name) setArtistName(d.settings.name)
      if (d.settings?.profile?.name) setArtistName(d.settings.profile.name)
    }).catch(() => {})

    // Load caption from query params (Boost button)
    const params = new URLSearchParams(window.location.search)
    const c = params.get('caption')
    if (c) setCaption(c)
    const ctx = params.get('context')
    if (ctx) setContext(ctx)
    const obj = params.get('objective')
    if (obj) setObjective(obj)

    // Load saved ad plans from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('signallab.ad_plans') || '[]')
      setSavedPlans(saved)
    } catch {}
  }, [])

  function togglePlatform(id: string) {
    setTargetPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  function saveAdPlan() {
    if (!adPlan) return
    const entry = {
      id: Date.now().toString(),
      name: `${campaignType} - ${objective} - ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      date: new Date().toISOString(),
      plan: adPlan,
    }
    const updated = [entry, ...savedPlans].slice(0, 20)
    setSavedPlans(updated)
    localStorage.setItem('signallab.ad_plans', JSON.stringify(updated))
  }

  function deleteSavedPlan(id: string) {
    const updated = savedPlans.filter(p => p.id !== id)
    setSavedPlans(updated)
    localStorage.setItem('signallab.ad_plans', JSON.stringify(updated))
  }

  async function generateAdPlan() {
    setGenerating(true)
    setError('')
    try {
      const budgetMap = { micro: '£10-50', low: '£50-100', mid: '£100-300', high: '£300-800', premium: '£800+' }
      const durationLabel = duration === '3' ? '3 days' : duration === '7' ? '1 week' : duration === '14' ? '2 weeks' : '1 month'

      let gigContext = ''
      try {
        const [gigsRes, releasesRes] = await Promise.allSettled([
          fetch('/api/gigs').then(r => r.json()),
          fetch('/api/releases').then(r => r.json()),
        ])
        const gigs = (gigsRes.status === 'fulfilled' ? gigsRes.value.gigs || [] : []).slice(0, 5)
        const releases = (releasesRes.status === 'fulfilled' ? releasesRes.value.releases || [] : []).slice(0, 3)
        if (gigs.length) gigContext += '\nUPCOMING GIGS:\n' + gigs.map((g: any) => `${g.date}: ${g.venue}, ${g.location}`).join('\n')
        if (releases.length) gigContext += '\nUPCOMING RELEASES:\n' + releases.map((r: any) => `${r.release_date}: "${r.title}" on ${r.label || 'TBC'}`).join('\n')
      } catch {}

      const raw = await callClaude(
        `You are a paid advertising strategist for underground electronic music artists. You build ad campaigns that feel organic, never salesy.\n\n${SKILL_ADS_MANAGER}\n\nRespond ONLY with valid JSON, no markdown.`,
        `Artist: ${artistName || 'Unknown'}
Campaign type: ${campaignType}
Objective: ${objective}
Budget: ${budgetMap[budget]} over ${durationLabel}
Target platforms: ${targetPlatforms.join(', ')}
Ad format: ${format}
${caption ? `Caption/content: "${caption}"` : ''}
${context ? `Context: ${context}` : ''}
${location ? `Target location: ${location}` : ''}
Age range: ${ageRange}
${interests ? `Interests/targeting: ${interests}` : ''}
${gigContext}

Generate a complete ad plan. Return:
{"campaign_type":"${campaignType}","objective":"${objective}","platforms":[{"name":"platform","budget_split":"percentage","why":"reason","format_rec":"recommended format for this platform"}],"audiences":[{"layer":"Warm/Expansion/Cold","targeting":"specific targeting","size":"estimated reach"}],"creative":["creative recommendation 1","2","3"],"schedule":"timeline with phases for ${durationLabel} campaign","budget_breakdown":"how to split the spend across ${durationLabel}","ab_tests":["A/B test suggestion 1","2"],"red_flags":["what to watch for"],"green_flags":["signals to scale"],"estimated_reach":"estimated total reach for budget","cost_per_result":"estimated cost per ${objective === 'followers' ? 'follower' : objective === 'traffic' ? 'click' : objective === 'conversions' ? 'conversion' : 'thousand impressions'}"}`,
        1200
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setAdPlan(d)
    } catch (err: any) {
      setError(err.message || 'Failed to generate ad plan')
    } finally {
      setGenerating(false)
    }
  }

  const s = {
    gold: '#ff2a1a',
    dim: '#c0bdb5',
    dimmer: '#a5a29a',
    dimmest: '#8a8782',
    panel: '#0e0e0e',
    border: 'rgba(255,255,255,0.08)',
    bg: '#050505',
    font: "var(--font-mono, 'Helvetica Neue', monospace)",
  }

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: '#f2f2f2', fontFamily: s.font }}>
      <SignalLabHeader />

      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Row 1: Campaign type + Objective ── */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SectionLabel>Campaign type</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['release', 'gig', 'always-on'] as const).map(t => (
                <PillBtn key={t} active={campaignType === t} onClick={() => setCampaignType(t)} gold={s.gold} border={s.border} dim={s.dim}>{t}</PillBtn>
              ))}
            </div>
          </div>
          <div style={{ flex: 2, minWidth: 300 }}>
            <SectionLabel>Objective</SectionLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OBJECTIVES.map(o => (
                <button key={o.id} onClick={() => setObjective(o.id)}
                  style={{
                    padding: '6px 14px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                    border: `1px solid ${objective === o.id ? s.gold : s.border}`,
                    color: objective === o.id ? s.gold : s.dim,
                    background: objective === o.id ? `${s.gold}12` : 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  title={o.desc}
                >{o.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 2: Budget + Duration + Format ── */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <SectionLabel>Budget</SectionLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['micro', 'low', 'mid', 'high', 'premium'] as const).map(b => (
                <PillBtn key={b} active={budget === b} onClick={() => setBudget(b)} gold={s.gold} border={s.border} dim={s.dim}>
                  {b === 'micro' ? '£10-50' : b === 'low' ? '£50-100' : b === 'mid' ? '£100-300' : b === 'high' ? '£300-800' : '£800+'}
                </PillBtn>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 180 }}>
            <SectionLabel>Duration</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['3', '7', '14', '30'] as const).map(d => (
                <PillBtn key={d} active={duration === d} onClick={() => setDuration(d)} gold={s.gold} border={s.border} dim={s.dim}>
                  {d === '3' ? '3 days' : d === '7' ? '1 week' : d === '14' ? '2 weeks' : '1 month'}
                </PillBtn>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 180 }}>
            <SectionLabel>Ad format</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['reel', 'story', 'carousel', 'static'] as const).map(f => (
                <PillBtn key={f} active={format === f} onClick={() => setFormat(f)} gold={s.gold} border={s.border} dim={s.dim}>{f}</PillBtn>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 3: Target platforms ── */}
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Target platforms</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {PLATFORMS.map(p => {
              const active = targetPlatforms.includes(p.id)
              return (
                <button key={p.id} onClick={() => togglePlatform(p.id)}
                  style={{
                    padding: '8px 18px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                    border: `1px solid ${active ? s.gold : s.border}`,
                    color: active ? '#f2f2f2' : s.dimmest,
                    background: active ? `${s.gold}18` : 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{p.label}</button>
              )
            })}
          </div>
        </div>

        {/* ── Row 4: Audience targeting ── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SectionLabel>Target location</SectionLabel>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="e.g. UK, London, Europe"
              style={inputStyle(s)} />
          </div>
          <div style={{ width: 140 }}>
            <SectionLabel>Age range</SectionLabel>
            <select value={ageRange} onChange={e => setAgeRange(e.target.value)} style={inputStyle(s)}>
              <option value="18-24">18-24</option>
              <option value="18-34">18-34</option>
              <option value="18-44">18-44</option>
              <option value="25-44">25-44</option>
              <option value="25-54">25-54</option>
              <option value="13-65+">All ages</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SectionLabel>Interests / targeting hints</SectionLabel>
            <input type="text" value={interests} onChange={e => setInterests(e.target.value)}
              placeholder="e.g. techno, Boiler Room, Resident Advisor"
              style={inputStyle(s)} />
          </div>
        </div>

        {/* ── Row 5: Caption + Context ── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <SectionLabel>Caption / content to boost</SectionLabel>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Paste caption or leave blank for general strategy"
              style={{ ...inputStyle(s), minHeight: 80, resize: 'vertical' as const }} />
          </div>
          <div style={{ flex: 1 }}>
            <SectionLabel>Context</SectionLabel>
            <textarea value={context} onChange={e => setContext(e.target.value)}
              placeholder="What are you promoting? Release, gig, brand awareness..."
              style={{ ...inputStyle(s), minHeight: 80, resize: 'vertical' as const }} />
          </div>
        </div>

        {/* ── Generate button row ── */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 32 }}>
          <button onClick={generateAdPlan} disabled={generating || targetPlatforms.length === 0}
            style={{
              padding: '12px 32px', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' as const,
              background: s.gold, color: s.bg, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              opacity: generating || targetPlatforms.length === 0 ? 0.4 : 1, fontWeight: 700,
            }}>
            {generating ? 'Generating...' : 'Generate ad plan'}
          </button>
          {savedPlans.length > 0 && (
            <button onClick={() => setShowSaved(!showSaved)}
              style={{ padding: '12px 20px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' as const, border: `1px solid ${s.border}`, background: 'transparent', color: s.dim, cursor: 'pointer', fontFamily: 'inherit' }}>
              {showSaved ? 'Hide saved' : `Saved plans (${savedPlans.length})`}
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff6b6b', padding: '10px 14px', fontSize: 11, marginBottom: 24 }}>{error}</div>
        )}

        {/* ── Saved plans ── */}
        {showSaved && savedPlans.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <SectionTitle gold={s.gold}>Saved ad plans</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedPlans.map(sp => (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: s.panel, border: `1px solid ${s.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{sp.name}</div>
                    <div style={{ fontSize: 10, color: s.dimmest, marginTop: 2 }}>{new Date(sp.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <button onClick={() => { setAdPlan(sp.plan); setShowSaved(false) }}
                    style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Load
                  </button>
                  <button onClick={() => deleteSavedPlan(sp.id)}
                    style={{ fontSize: 10, background: 'transparent', border: 'none', color: s.dimmest, cursor: 'pointer', fontFamily: 'inherit' }}>
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading state ── */}
        {generating && !adPlan && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: s.dim }}>
              Building your ad strategy...
            </div>
          </div>
        )}

        {/* ── No plan yet ── */}
        {!generating && !adPlan && !showSaved && (
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>No ad plan yet</div>
            <div style={{ fontSize: 11, color: s.dimmest }}>
              Configure your campaign above and generate. Or click Boost on any caption in Artist Voice.
            </div>
          </div>
        )}

        {/* ── Ad plan results ── */}
        {adPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Save bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,42,26,0.06)', border: `1px solid ${s.gold}30` }}>
              <div style={{ fontSize: 11, color: s.dim }}>
                {adPlan.estimated_reach && <span>Est. reach: <strong style={{ color: '#f2f2f2' }}>{adPlan.estimated_reach}</strong></span>}
                {adPlan.cost_per_result && <span style={{ marginLeft: 16 }}>Est. cost: <strong style={{ color: '#f2f2f2' }}>{adPlan.cost_per_result}</strong></span>}
              </div>
              <button onClick={saveAdPlan}
                style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' as const, background: s.gold, color: s.bg, border: 'none', padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                Save plan
              </button>
            </div>

            {/* Platforms */}
            <div>
              <SectionTitle gold={s.gold}>Platforms</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(adPlan.platforms.length, 3)}, 1fr)`, gap: 12 }}>
                {adPlan.platforms.map((p, i) => (
                  <div key={i} style={{ background: '#1d1d1d', border: `1px solid ${s.border}`, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: s.gold }}>{p.budget_split}</span>
                    </div>
                    <div style={{ fontSize: 11, color: s.dim, lineHeight: 1.5, marginBottom: 6 }}>{p.why}</div>
                    {p.format_rec && <div style={{ fontSize: 10, color: s.dimmest, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Best format: {p.format_rec}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Audiences */}
            <div>
              <SectionTitle gold={s.gold}>Audience layers</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {adPlan.audiences.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: s.gold, width: 80, flexShrink: 0 }}>{a.layer}</div>
                    <div style={{ flex: 1, fontSize: 12, color: '#f2f2f2', minWidth: 0 }}>{a.targeting}</div>
                    <div style={{ fontSize: 11, color: s.dimmer, flexShrink: 0 }}>{a.size}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Creative recs */}
            <div>
              <SectionTitle gold={s.gold}>Creative recommendations</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {adPlan.creative.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                    <span style={{ fontSize: 10, color: s.gold, marginTop: 2, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, lineHeight: 1.5 }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* A/B Tests */}
            {adPlan.ab_tests && adPlan.ab_tests.length > 0 && (
              <div>
                <SectionTitle gold={s.gold}>A/B test ideas</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {adPlan.ab_tests.map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                      <span style={{ fontSize: 10, color: '#b0a0ff', marginTop: 2, flexShrink: 0 }}>AB</span>
                      <span style={{ fontSize: 12, lineHeight: 1.5 }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule + Budget side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <SectionTitle gold={s.gold}>Schedule</SectionTitle>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: '#f2f2f2', padding: '12px 16px', background: '#1d1d1d', border: `1px solid ${s.border}`, whiteSpace: 'pre-wrap' }}>{adPlan.schedule}</div>
              </div>
              <div>
                <SectionTitle gold={s.gold}>Budget breakdown</SectionTitle>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: '#f2f2f2', padding: '12px 16px', background: '#1d1d1d', border: `1px solid ${s.border}`, whiteSpace: 'pre-wrap' }}>{adPlan.budget_breakdown}</div>
              </div>
            </div>

            {/* Signals */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <SectionTitle gold={s.gold}>Red flags</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {adPlan.red_flags.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, padding: '8px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                      <span style={{ color: '#ff4444', flexShrink: 0, marginTop: 1 }}>!</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SectionTitle gold={s.gold}>Green flags</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {adPlan.green_flags.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, padding: '8px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                      <span style={{ color: '#44cc66', flexShrink: 0, marginTop: 1 }}>+</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a8782', marginBottom: 6, fontWeight: 700 }}>{children}</div>
}

function SectionTitle({ children, gold }: { children: string; gold: string }) {
  return <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: gold, marginBottom: 10 }}>{children}</div>
}

function PillBtn({ children, active, onClick, gold, border, dim }: { children: React.ReactNode; active: boolean; onClick: () => void; gold: string; border: string; dim: string }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '6px 14px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
        border: `1px solid ${active ? gold : border}`,
        color: active ? gold : dim,
        background: active ? `${gold}12` : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>{children}</button>
  )
}

function inputStyle(s: { panel: string; border: string; font: string }): React.CSSProperties {
  return {
    width: '100%', background: s.panel, border: `1px solid ${s.border}`,
    padding: '10px 12px', color: '#f2f2f2', fontSize: 12, fontFamily: s.font,
    outline: 'none',
  }
}
