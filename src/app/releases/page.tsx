'use client'

// Drop Lab — tab shell hosting Releases + DJ Promo.
// Phase 1 of the promo-hub migration extracted the two tabs into components
// under src/components/promo/. This file is now a thin router/layout only.
// See docs/plans/promo-hub-migration.md. Route will be renamed /promo in Phase 3.

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMobile } from '@/hooks/useMobile'
import { ReleasesTab } from '@/components/promo/ReleasesTab'
import { DJPromoTab } from '@/components/promo/DJPromoTab'

export default function DropLabPage() {
  return (
    <Suspense fallback={null}>
      <DropLabInner />
    </Suspense>
  )
}

function DropLabInner() {
  const mobile = useMobile()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'releases' | 'promo'>(searchParams.get('tab') === 'promo' ? 'promo' : 'releases')
  const [initialPromoUrl, setInitialPromoUrl] = useState('')
  const [initialReleaseId, setInitialReleaseId] = useState<string | null>(null)

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)', borderMid: 'var(--border)',
    gold: 'var(--gold)', goldBright: 'var(--gold-bright)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: mobile ? '20px 16px 0' : '40px 48px 0', borderBottom: `1px solid ${s.border}` }}>
        <div style={{ display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', flexDirection: mobile ? 'column' : 'row', gap: mobile ? '16px' : '0', paddingBottom: '0', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />Drop Lab
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px, 7vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, textTransform: 'uppercase' }}>
              {tab === 'releases' ? 'Your catalogue' : 'DJ Promo'}
            </div>
          </div>
          {tab === 'releases' ? (
            <Link href="/releases/new" style={{ background: s.gold, color: '#050505', textDecoration: 'none', padding: '0 24px', height: '36px', display: 'inline-flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: mobile ? '0' : '4px' }}>
              + New release
            </Link>
          ) : null}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['releases', 'promo'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font,
              color: tab === t ? s.gold : s.dimmer,
              borderBottom: tab === t ? `1px solid ${s.gold}` : '1px solid transparent',
              marginBottom: '-1px',
            }}>
              {t === 'releases' ? 'Releases' : 'DJ Promo'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'releases'
        ? <ReleasesTab s={s} mobile={mobile} onSendPromo={(url, releaseId) => { setInitialPromoUrl(url); setInitialReleaseId(releaseId ?? null); setTab('promo') }} />
        : <DJPromoTab s={s} initialUrl={initialPromoUrl} initialReleaseId={initialReleaseId} onUrlConsumed={() => { setInitialPromoUrl(''); setInitialReleaseId(null) }} />}
    </div>
  )
}
