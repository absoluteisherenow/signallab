'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
}

export default function AdsPage() {
  const [adPlan, setAdPlan] = useState<AdPlan | null>(null)
  const [generatingAdPlan, setGeneratingAdPlan] = useState(false)
  const [adCampaignType, setAdCampaignType] = useState<'release' | 'gig' | 'always-on'>('release')
  const [adBudget, setAdBudget] = useState<'low' | 'mid' | 'high'>('low')
  const [boostCaption, setBoostCaption] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const caption = params.get('caption')
    if (caption) {
      setBoostCaption(caption)
      // Auto-generate when arriving with a caption
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
          system: `You are an expert paid media strategist for underground electronic music artists.\n\n${SKILL_ADS_MANAGER}\n\nReturn ONLY valid JSON.`,
          max_tokens: 1200,
          messages: [{ role: 'user', content: `Build a paid ad plan.\n\nCampaign type: ${adCampaignType}\nBudget: ${budgetMap[adBudget]}\n${caption ? `Caption/content to boost: ${caption}\n` : ''}Artist: NIGHT manoeuvres (electronic music)\n\nReturn JSON:\n{"campaign_type":"${adCampaignType}","platforms":[{"name":"platform","budget_split":"percentage","why":"reason"}],"audiences":[{"layer":"Warm/Expansion/Cold","targeting":"specific targeting","size":"estimated reach"}],"creative":["creative recommendation 1","2","3"],"schedule":"timeline with phases","budget_breakdown":"how to split the spend","red_flags":["what to watch for"],"green_flags":["signals to scale"]}` }],
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

  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono flex flex-col">
      <SignalLabHeader right={
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/broadcast" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px',
            background: 'rgba(176,141,87,0.08)', color: '#8a8780',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '2px',
            fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
            fontFamily: "'DM Mono', monospace", fontWeight: 400,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Content Studio
          </Link>
          <Link href="/broadcast/strategy" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px',
            background: 'rgba(176,141,87,0.08)', color: '#8a8780',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '2px',
            fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
            fontFamily: "'DM Mono', monospace", fontWeight: 400,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Content Strategy
          </Link>
        </div>
      } />

      <div className="flex flex-col gap-7 p-8">
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
      </div>
    </div>
  )
}
