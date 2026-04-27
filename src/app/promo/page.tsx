'use client'

// /promo — canonical home for the releases catalogue + DJ promo contacts
// + blast composer. Phase 3 of the promo-hub migration moved this here from
// /releases. The old /releases and /drop-lab URLs redirect to this route.
// See docs/plans/promo-hub-migration.md.

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMobile } from '@/hooks/useMobile'
import { ReleasesTab } from '@/components/promo/ReleasesTab'
import { DJPromoTab } from '@/components/promo/DJPromoTab'
import { GuestListTab } from '@/components/promo/GuestListTab'
import { PromoNextAction } from '@/components/promo/PromoNextAction'

export default function PromoPage() {
  return (
    <Suspense fallback={null}>
      <PromoInner />
    </Suspense>
  )
}

function PromoInner() {
  const mobile = useMobile()
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const t = searchParams.get('tab')
    if (t === 'promo') return 'promo' as const
    if (t === 'guestlist') return 'guestlist' as const
    return 'releases' as const
  })()
  const [tab, setTab] = useState<'releases' | 'promo' | 'guestlist'>(initialTab)
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
              <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />Promo Lab
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px, 7vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, textTransform: 'uppercase' }}>
              {tab === 'releases' ? 'Your catalogue' : tab === 'promo' ? 'DJ Promo' : 'Guest list'}
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
          {(['releases', 'promo', 'guestlist'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font,
              color: tab === t ? s.gold : s.dimmer,
              borderBottom: tab === t ? `1px solid ${s.gold}` : '1px solid transparent',
              marginBottom: '-1px',
            }}>
              {t === 'releases' ? 'Releases' : t === 'promo' ? 'DJ Promo' : 'Guest list'}
            </button>
          ))}
        </div>
      </div>

      <PromoNextAction s={s} mobile={mobile} onSwitchTab={setTab} />

      {tab === 'releases' && <ReleasesTab s={s} mobile={mobile} onSendPromo={(url, releaseId) => { setInitialPromoUrl(url); setInitialReleaseId(releaseId ?? null); setTab('promo') }} />}
      {tab === 'promo' && <DJPromoTab s={s} initialUrl={initialPromoUrl} initialReleaseId={initialReleaseId} onUrlConsumed={() => { setInitialPromoUrl(''); setInitialReleaseId(null) }} />}
      {tab === 'guestlist' && <GuestListTab s={s} mobile={mobile} />}
    </div>
  )
}
