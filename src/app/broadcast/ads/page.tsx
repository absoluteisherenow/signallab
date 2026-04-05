'use client'

import { useState, useEffect } from 'react'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { SKILL_ADS_MANAGER } from '@/lib/skillPromptsClient'

interface AdPlan {
  campaign_type: string
  platforms: { name: string; budget_split: string; why: string }[]
  audiences: { layer: string; targeting: string; size: string }[]
  creative: string[]
  schedule: string
  budget_breakdown: string
  red_flags: string[]
  green_flags: string[]
  meta_compliance: {
    status: 'compliant' | 'warnings' | 'issues'
    checks: { rule: string; status: 'pass' | 'warn' | 'fail'; note: string }[]
  }
}

interface InsightsData {
  period: number
  account: Record<string, number>
  dailyReach: { date: string; value: number }[]
  posts: any[]
  topPosts: any[]
  averages: { reach: number; engagement: number }
  postCount: number
}

export default function AdsPage() {
  const [adPlan, setAdPlan] = useState<AdPlan | null>(null)
  const [generatingAdPlan, setGeneratingAdPlan] = useState(false)
  const [adCampaignType, setAdCampaignType] = useState<'release' | 'gig' | 'always-on'>('release')
  const [adBudget, setAdBudget] = useState<'low' | 'mid' | 'high'>('low')
  const [boostCaption, setBoostCaption] = useState('')
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsPeriod, setInsightsPeriod] = useState<'7' | '14' | '28'>('28')
  const [insightsError, setInsightsError] = useState('')
  const [activeTab, setActiveTab] = useState<'performance' | 'planner'>('performance')

  async function loadInsights(period: string) {
    setLoadingInsights(true)
    setInsightsError('')
    try {
      const res = await fetch(`/api/instagram/insights?period=${period}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed (${res.status})`)
      }
      setInsights(await res.json())
    } catch (err: any) {
      setInsightsError(err.message)
    } finally {
      setLoadingInsights(false)
    }
  }

  useEffect(() => {
    loadInsights(insightsPeriod)
  }, [insightsPeriod])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const caption = params.get('caption')
    if (caption) {
      setBoostCaption(caption)
      setActiveTab('planner')
      setTimeout(() => generateAdPlan(caption), 300)
    }
  }, [])

  async function generateAdPlan(caption?: string) {
    setGeneratingAdPlan(true)
    try {
      const budgetMap = { low: '£100-300/month', mid: '£300-800/month', high: '£800+/month' }
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          system: `You are an expert paid media strategist for underground electronic music artists. You have deep knowledge of Meta Ads Manager policies, Instagram promotion rules, and music industry advertising best practices.\n\n${SKILL_ADS_MANAGER}\n\nCRITICAL: Every ad plan MUST be cross-referenced against current Meta advertising policies:\n- Music content: licensed audio only in ads, no copyrighted music without rights\n- Targeting: no discriminatory targeting by race, ethnicity, religion, sexual orientation\n- Special Ad Categories: music events may trigger "entertainment" category in some regions\n- Budget minimums: Meta requires minimum £1/day per ad set\n- Audience size: Meta recommends minimum 1,000 in custom audiences, warns below 100\n- Ad text: primary text max 125 chars for optimal delivery, headline max 40 chars\n- Image/video specs: 1080x1080 or 1080x1920, max 30s for Stories/Reels ads\n- Landing pages: must match ad content, no misleading destinations\n- Alcohol/nightlife: age-gated in most regions (18+ UK, 21+ US)\n- Engagement bait: "like this if..." or "tag a friend" can get ads rejected\n- Before/after claims: can't promise specific follower/stream growth\n\nReturn ONLY valid JSON.`,
          max_tokens: 1800,
          messages: [{ role: 'user', content: `Build a paid ad plan and validate it against Meta advertising policies.\n\nCampaign type: ${adCampaignType}\nBudget: ${budgetMap[adBudget]}\n${caption ? `Caption/content to boost: ${caption}\n` : ''}Artist: NIGHT manoeuvres (electronic music, UK)\n\nReturn JSON:\n{"campaign_type":"${adCampaignType}","platforms":[{"name":"platform","budget_split":"percentage","why":"reason"}],"audiences":[{"layer":"Warm/Expansion/Cold","targeting":"specific targeting","size":"estimated reach"}],"creative":["creative recommendation 1","2","3"],"schedule":"timeline with phases","budget_breakdown":"how to split the spend","red_flags":["what to watch for"],"green_flags":["signals to scale"],"meta_compliance":{"status":"compliant|warnings|issues","checks":[{"rule":"Meta policy rule name","status":"pass|warn|fail","note":"explanation of compliance status and any action needed"}]}}` }],
        }),
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        setAdPlan(JSON.parse(jsonMatch[0]))
      }
    } catch (err: any) {
      console.error('Ad plan failed:', err)
    } finally {
      setGeneratingAdPlan(false)
    }
  }

  function fmt(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return String(n)
  }

  const maxReach = insights?.dailyReach?.length
    ? Math.max(...insights.dailyReach.map(d => d.value), 1)
    : 1

  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono flex flex-col">
      <SignalLabHeader />

      <div className="flex flex-col gap-5 p-8">
        {/* Tab switcher */}
        <div className="flex gap-1">
          {(['performance', 'planner'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-[10px] tracking-[.16em] uppercase px-5 py-2 border-b-2 transition-colors ${
                activeTab === tab ? 'border-[#b08d57] text-[#b08d57]' : 'border-transparent text-[#52504c] hover:text-[#8a8780]'
              }`}>
              {tab === 'performance' ? 'Performance' : 'Ad planner'}
            </button>
          ))}
        </div>

        {/* ─── PERFORMANCE TAB ─── */}
        {activeTab === 'performance' && (
          <div className="bg-[#0e0d0b] border border-white/7 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
                Instagram performance<div className="flex-1 h-px bg-white/10 ml-3 w-20" />
              </div>
              <div className="flex gap-1.5">
                {(['7', '14', '28'] as const).map(p => (
                  <button key={p} onClick={() => setInsightsPeriod(p)}
                    className={`text-[9px] tracking-[.12em] uppercase px-2.5 py-1 border transition-colors ${
                      insightsPeriod === p ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/10 text-[#52504c] hover:border-white/20'
                    }`}>
                    {p}d
                  </button>
                ))}
              </div>
            </div>

            {loadingInsights && (
              <div className="flex items-center gap-2 py-8 justify-center">
                <div className="w-3 h-3 border border-[#b08d57] border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-[#52504c] tracking-[.1em]">Loading insights...</span>
              </div>
            )}

            {insightsError && (
              <div className="border border-red-900/30 bg-red-900/5 p-4 text-center">
                <div className="text-[11px] text-red-400/80 mb-1">{insightsError}</div>
                <div className="text-[10px] text-[#52504c]">Connect Instagram in Settings to see performance data</div>
              </div>
            )}

            {insights && !loadingInsights && (
              <div className="space-y-5">
                {/* Account overview stats */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: 'Reach', value: insights.account.reach || 0 },
                    { label: 'Impressions', value: insights.account.impressions || 0 },
                    { label: 'Engaged', value: insights.account.accounts_engaged || 0 },
                    { label: 'Profile views', value: insights.account.profile_views || 0 },
                    { label: 'Link clicks', value: insights.account.website_clicks || 0 },
                  ].map(s => (
                    <div key={s.label} className="bg-[#1a1917] border border-white/7 p-3 text-center">
                      <div className="text-[16px] text-[#f0ebe2] font-light">{fmt(s.value)}</div>
                      <div className="text-[8px] tracking-[.18em] uppercase text-[#52504c] mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Daily reach sparkline */}
                {insights.dailyReach.length > 0 && (
                  <div className="bg-[#1a1917] border border-white/7 p-4">
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-3">Daily reach</div>
                    <div className="flex items-end gap-[2px] h-16">
                      {insights.dailyReach.map((d, i) => (
                        <div key={i} className="flex-1 group relative">
                          <div
                            className="bg-[#b08d57]/40 hover:bg-[#b08d57]/70 transition-colors rounded-t-sm w-full"
                            style={{ height: `${Math.max((d.value / maxReach) * 100, 2)}%` }}
                          />
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-[#8a8780] opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                            {fmt(d.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[8px] text-[#2e2c29]">{insights.dailyReach[0]?.date?.slice(5) || ''}</span>
                      <span className="text-[8px] text-[#2e2c29]">{insights.dailyReach[insights.dailyReach.length - 1]?.date?.slice(5) || ''}</span>
                    </div>
                  </div>
                )}

                {/* Averages */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1a1917] border border-white/7 p-3 flex items-center justify-between">
                    <span className="text-[9px] tracking-[.15em] uppercase text-[#52504c]">Avg reach / post</span>
                    <span className="text-[14px] text-[#f0ebe2]">{fmt(insights.averages.reach)}</span>
                  </div>
                  <div className="bg-[#1a1917] border border-white/7 p-3 flex items-center justify-between">
                    <span className="text-[9px] tracking-[.15em] uppercase text-[#52504c]">Avg engagement / post</span>
                    <span className="text-[14px] text-[#f0ebe2]">{fmt(insights.averages.engagement)}</span>
                  </div>
                </div>

                {/* Top performing posts */}
                {insights.topPosts.length > 0 && (
                  <div>
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-3">Top performing posts</div>
                    <div className="space-y-2">
                      {insights.topPosts.map((post, i) => (
                        <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-[#1a1917] border border-white/7 p-3 hover:border-[#b08d57]/30 transition-colors group">
                          {post.thumbnail_url && (
                            <img src={post.thumbnail_url} alt="" className="w-10 h-10 object-cover rounded-sm flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-[#f0ebe2] truncate">{post.caption || '(no caption)'}</div>
                            <div className="flex gap-3 mt-1">
                              <span className="text-[9px] text-[#52504c]">
                                <span className="text-[#8a8780]">{post.media_type === 'VIDEO' || post.media_type === 'REELS' ? 'Reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Photo'}</span>
                              </span>
                              <span className="text-[9px] text-[#52504c]">{new Date(post.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                            </div>
                          </div>
                          <div className="flex gap-4 flex-shrink-0">
                            <div className="text-center">
                              <div className="text-[12px] text-[#f0ebe2]">{fmt(post.reach || 0)}</div>
                              <div className="text-[7px] tracking-[.15em] uppercase text-[#52504c]">Reach</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[12px] text-[#f0ebe2]">{fmt(post.impressions || 0)}</div>
                              <div className="text-[7px] tracking-[.15em] uppercase text-[#52504c]">Impr</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[12px] text-[#f0ebe2]">{fmt(post.like_count + post.comments_count)}</div>
                              <div className="text-[7px] tracking-[.15em] uppercase text-[#52504c]">Eng</div>
                            </div>
                            {(post.plays != null && post.plays > 0) && (
                              <div className="text-center">
                                <div className="text-[12px] text-[#f0ebe2]">{fmt(post.plays)}</div>
                                <div className="text-[7px] tracking-[.15em] uppercase text-[#52504c]">Plays</div>
                              </div>
                            )}
                            <div className="text-center">
                              <div className="text-[12px] text-[#b08d57]">{fmt(post.saved || 0)}</div>
                              <div className="text-[7px] tracking-[.15em] uppercase text-[#52504c]">Saved</div>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#52504c] group-hover:text-[#b08d57] transition-colors">→</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* All recent posts */}
                {insights.posts.length > 5 && (
                  <div>
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-3">All recent posts ({insights.postCount})</div>
                    <div className="grid grid-cols-5 gap-2">
                      {insights.posts.map(post => (
                        <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer"
                          className="bg-[#1a1917] border border-white/7 p-2 hover:border-[#b08d57]/30 transition-colors group">
                          {post.thumbnail_url && (
                            <img src={post.thumbnail_url} alt="" className="w-full aspect-square object-cover rounded-sm mb-2" />
                          )}
                          <div className="flex justify-between text-[8px]">
                            <span className="text-[#52504c]">{fmt(post.reach || 0)} reach</span>
                            <span className="text-[#8a8780]">{post.like_count} ♥</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── AD PLANNER TAB ─── */}
        {activeTab === 'planner' && (
          <div className="bg-[#0e0d0b] border border-white/7 p-7">
            <div className="flex items-center gap-2 mb-2 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
              Ad amplifier — paid strategy<div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="text-[10px] tracking-[.07em] text-[#8a8780] mb-5 italic">Underground-calibrated paid campaigns. Every ad feels organic — never salesy.</div>

            {boostCaption && (
              <div className="mb-5 p-3 border border-[#b08d57]/20 bg-[#b08d57]/5">
                <div className="text-[9px] tracking-[.15em] uppercase text-[#b08d57] mb-1.5">Boosting caption</div>
                <div className="text-[11px] text-[#f0ebe2] leading-relaxed">{boostCaption}</div>
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <div className="text-[9px] tracking-[.15em] uppercase text-[#52504c] mb-2">Campaign type</div>
                <div className="flex gap-2">
                  {(['release', 'gig', 'always-on'] as const).map(t => (
                    <button key={t} onClick={() => setAdCampaignType(t)}
                      className={`text-[10px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${adCampaignType === t ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/13 text-[#8a8780] hover:border-white/20'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[9px] tracking-[.15em] uppercase text-[#52504c] mb-2">Monthly budget</div>
                <div className="flex gap-2">
                  {([['low', '£100-300'], ['mid', '£300-800'], ['high', '£800+']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setAdBudget(k)}
                      className={`text-[10px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${adBudget === k ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/13 text-[#8a8780] hover:border-white/20'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={() => generateAdPlan(boostCaption || undefined)} disabled={generatingAdPlan}
              className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors disabled:opacity-50 flex items-center gap-2 mb-5">
              {generatingAdPlan && <div className="w-2 h-2 border border-[#070706] border-t-transparent rounded-full animate-spin" />}
              {generatingAdPlan ? 'Building plan...' : 'Generate ad plan →'}
            </button>

            {adPlan && (
              <div className="space-y-4">
                <div>
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Platform split</div>
                  <div className="grid grid-cols-3 gap-2">
                    {adPlan.platforms.map((p, i) => (
                      <div key={i} className="bg-[#1a1917] border border-white/7 p-3">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[11px] tracking-[.08em] text-[#f0ebe2]">{p.name}</span>
                          <span className="text-[11px] text-[#b08d57]">{p.budget_split}</span>
                        </div>
                        <div className="text-[10px] text-[#8a8780] leading-relaxed">{p.why}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Audience layers</div>
                  <div className="space-y-2">
                    {adPlan.audiences.map((a, i) => (
                      <div key={i} className="flex items-start gap-3 bg-[#1a1917] border border-white/7 p-3">
                        <span className={`text-[10px] tracking-[.12em] uppercase flex-shrink-0 px-2 py-0.5 border ${
                          a.layer.toLowerCase().includes('warm') ? 'border-[#b08d57]/30 text-[#b08d57]' :
                          a.layer.toLowerCase().includes('expansion') ? 'border-[#3d6b4a]/30 text-[#3d6b4a]' :
                          'border-white/13 text-[#8a8780]'
                        }`}>{a.layer}</span>
                        <div className="flex-1">
                          <div className="text-[11px] text-[#f0ebe2] leading-relaxed">{a.targeting}</div>
                          <div className="text-[10px] text-[#52504c] mt-1">{a.size}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1a1917] border border-white/7 p-4">
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Creative recommendations</div>
                    {adPlan.creative.map((c, i) => (
                      <div key={i} className="flex gap-2 mb-1.5 last:mb-0">
                        <span className="text-[#b08d57] opacity-50 flex-shrink-0 text-[10px]">→</span>
                        <span className="text-[11px] text-[#8a8780] leading-relaxed">{c}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#1a1917] border border-white/7 p-4">
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Schedule</div>
                    <div className="text-[11px] text-[#8a8780] leading-relaxed mb-3">{adPlan.schedule}</div>
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Budget breakdown</div>
                    <div className="text-[11px] text-[#8a8780] leading-relaxed">{adPlan.budget_breakdown}</div>
                  </div>
                </div>

                {adPlan.meta_compliance && (
                  <div className={`bg-[#1a1917] border p-4 ${
                    adPlan.meta_compliance.status === 'compliant' ? 'border-[#3d6b4a]/30' :
                    adPlan.meta_compliance.status === 'warnings' ? 'border-[#b08d57]/30' :
                    'border-red-800/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${
                        adPlan.meta_compliance.status === 'compliant' ? 'bg-[#3d6b4a]' :
                        adPlan.meta_compliance.status === 'warnings' ? 'bg-[#b08d57]' :
                        'bg-red-500'
                      }`} />
                      <div className="text-[9px] tracking-[.18em] uppercase text-[#8a8780]">
                        Meta policy check — {adPlan.meta_compliance.status === 'compliant' ? 'all clear' : adPlan.meta_compliance.status === 'warnings' ? 'review needed' : 'issues found'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {adPlan.meta_compliance.checks.map((check, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`text-[10px] flex-shrink-0 mt-0.5 ${
                            check.status === 'pass' ? 'text-[#3d6b4a]' :
                            check.status === 'warn' ? 'text-[#b08d57]' :
                            'text-red-400'
                          }`}>
                            {check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'}
                          </span>
                          <div>
                            <span className="text-[10px] text-[#f0ebe2]">{check.rule}</span>
                            <span className="text-[10px] text-[#52504c] ml-2">{check.note}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1a1917] border border-red-900/20 p-4">
                    <div className="text-[9px] tracking-[.18em] uppercase text-red-400/60 mb-2">Pause if</div>
                    {adPlan.red_flags.map((f, i) => (
                      <div key={i} className="text-[10px] text-[#8a8780] leading-relaxed mb-1">{f}</div>
                    ))}
                  </div>
                  <div className="bg-[#1a1917] border border-[#3d6b4a]/20 p-4">
                    <div className="text-[9px] tracking-[.18em] uppercase text-[#3d6b4a]/60 mb-2">Scale if</div>
                    {adPlan.green_flags.map((f, i) => (
                      <div key={i} className="text-[10px] text-[#8a8780] leading-relaxed mb-1">{f}</div>
                    ))}
                  </div>
                </div>

                <button onClick={() => {
                  const text = `AD PLAN — ${adPlan.campaign_type.toUpperCase()}\n\nPLATFORMS:\n${adPlan.platforms.map(p => `${p.name} (${p.budget_split}): ${p.why}`).join('\n')}\n\nAUDIENCES:\n${adPlan.audiences.map(a => `[${a.layer}] ${a.targeting} — ${a.size}`).join('\n')}\n\nCREATIVE:\n${adPlan.creative.map(c => `→ ${c}`).join('\n')}\n\nSCHEDULE: ${adPlan.schedule}\nBUDGET: ${adPlan.budget_breakdown}\n\nPAUSE IF:\n${adPlan.red_flags.join('\n')}\n\nSCALE IF:\n${adPlan.green_flags.join('\n')}`
                  navigator.clipboard.writeText(text)
                }} className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">
                  Copy full plan →
                </button>
              </div>
            )}

            {!adPlan && !generatingAdPlan && !boostCaption && (
              <div className="border border-dashed border-white/13 p-6 text-center">
                <div className="text-[11px] tracking-[.1em] text-[#8a8780] mb-1">Select campaign type and budget, then generate</div>
                <div className="text-[10px] tracking-[.07em] text-[#2e2c29]">Or hit &quot;Boost&quot; on any caption in Content Studio</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
