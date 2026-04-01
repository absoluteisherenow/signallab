'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScanPulse } from '@/components/ui/ScanPulse'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
  audience: number
  status: string
  promoter_email?: string
}


function currencySymbol(c: string): string {
  const map: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CHF: 'CHF ', AUD: 'A$', CAD: 'C$', JPY: '¥' }
  return map[c] || c + ' '
}

const f = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)', mid: 'var(--border)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)', dimmest: 'var(--text-dimmest)',
  green: 'var(--green)', font: 'var(--font-mono)',
}

export function GigsList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const openId = searchParams.get('open')

  const [gigs, setGigs] = useState<Gig[] | null>(null)
  const [selected, setSelected] = useState<string | null>(openId)
  const [advanceStatus, setAdvanceStatus] = useState<Record<string, string>>({})
  const [showEmailInput, setShowEmailInput] = useState<string | null>(null)
  const [promoterEmail, setPromoterEmail] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/gigs')
      .then(r => r.json())
      .then(d => setGigs(d.gigs || []))
      .catch(() => setGigs([]))
  }, [])

  useEffect(() => {
    fetch('/api/advance')
      .then(r => r.json())
      .then(d => {
        if (d.requests) {
          const map: Record<string, string> = {}
          d.requests.forEach((req: { gig_id: string; completed: boolean }) => {
            map[req.gig_id] = req.completed ? 'complete' : 'sent'
          })
          setAdvanceStatus(map)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (openId) {
      setSelected(openId)
      setTimeout(() => document.getElementById(`gig-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400)
    }
  }, [openId])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function sendAdvance(gig: Gig, email: string) {
    if (!email) return
    setSending(gig.id)
    try {
      const res = await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gigId: gig.id, gigTitle: gig.title, venue: gig.venue, date: gig.date, promoterEmail: email }),
      })
      const data = await res.json()
      if (data.success || data.id) {
        setAdvanceStatus(prev => ({ ...prev, [gig.id]: 'sent' }))
        setShowEmailInput(null)
        setPromoterEmail('')
        showToast(`Advance request sent to ${email}`)
      } else showToast('Error: ' + (data.error || 'Failed'))
    } catch { showToast('Failed to send') }
    finally { setSending(null) }
  }

  const aColor = (s: string) => s === 'complete' ? f.green : s === 'sent' ? f.gold : f.dimmer
  const aLabel = (s: string) => s === 'complete' ? 'Advance complete' : s === 'sent' ? 'Sent — awaiting' : 'Not sent'
  const gigList = gigs || []
  const totalFees = gigList.filter(g => g.status === 'confirmed').reduce((a, g) => a + g.fee, 0)

  return (
    <div style={{ background: f.bg, color: f.text, fontFamily: f.font, minHeight: '100vh' }}>

      <PageHeader
        section="Tour Lab"
        title="Your gigs"
        tabs={[
          { label: 'Gigs', href: '/gigs', active: pathname === '/gigs' || pathname.startsWith('/gigs/') },
          { label: 'Travel', href: '/logistics', active: pathname === '/logistics' },
          { label: 'Finances', href: '/business/finances', active: pathname === '/business/finances' },
          { label: 'Contracts', href: '/contracts', active: pathname === '/contracts' },
        ]}
        right={
          <>
            <Link href="/contracts" style={{ textDecoration: 'none', border: `1px solid ${f.border}`, color: f.dimmer, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 20px', display: 'inline-block', fontFamily: f.font }}>Upload contract</Link>
            <button onClick={() => router.push('/gigs/new')} style={{ background: 'transparent', border: `1px solid ${f.gold}`, color: f.gold, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px 24px', cursor: 'pointer' }}>
              + Add gig
            </button>
          </>
        }
      />

      <div style={{ padding: '40px 48px' }}>

      {/* HEADERS */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 150px 100px 80px 100px 160px', padding: '10px 24px', fontSize: '10px', letterSpacing: '0.18em', color: f.dimmer, textTransform: 'uppercase' }}>
        {['Show', 'Date', 'Location', 'Status', 'Cap.', 'Fee', 'Advance'].map(h => <div key={h}>{h}</div>)}
      </div>

      {gigs === null && (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: f.dimmer, fontSize: '13px' }}>Loading...</div>
      )}

      {gigs !== null && gigList.length === 0 && (
        <div style={{ background: f.panel, border: `1px solid ${f.border}`, padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: f.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>No gigs yet</div>
          <div style={{ fontSize: '15px', color: f.dim, marginBottom: '6px' }}>Your upcoming shows will appear here.</div>
          <div style={{ fontSize: '12px', color: f.dimmer, marginBottom: '20px' }}>Paste a booking email to create your first gig automatically, or add one manually.</div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href="/contracts" style={{ textDecoration: 'none', background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${f.gold}`, color: f.gold, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '14px 28px', display: 'inline-block' }}>Add from booking email →</Link>
            <button onClick={() => router.push('/gigs/new')} style={{ background: 'transparent', border: `1px solid ${f.border}`, color: f.dimmer, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '14px 24px', cursor: 'pointer' }}>Add manually</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {gigList.map(gig => {
          const isOpen = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)
          const advStatus = advanceStatus[gig.id] || 'not_sent'

          return (
            <div key={gig.id} id={`gig-${gig.id}`}>
              <div onClick={() => setSelected(isOpen ? null : gig.id)} style={{
                display: 'grid', gridTemplateColumns: '2fr 120px 150px 100px 80px 100px 160px',
                padding: '18px 24px', background: isOpen ? '#141310' : f.panel,
                border: `1px solid ${isOpen ? f.gold + '40' : f.border}`,
                cursor: 'pointer', alignItems: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#111009' }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = f.panel }}
              >
                <div>
                  <div style={{ fontSize: '14px', color: f.text, marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '11px', color: f.dimmer }}>{gig.venue}</div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: f.dim }}>{gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: '10px', color: f.dimmest }}>{daysTo > 0 ? `${daysTo}d` : 'past'}</div>
                </div>
                <div style={{ fontSize: '12px', color: f.dimmer }}>{gig.location?.split(',')[0]}</div>
                <div>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? f.green : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a18' : '#8a6a3a18', padding: '4px 10px' }}>
                    {gig.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: f.dim }}>{gig.audience?.toLocaleString()}</div>
                <div style={{ fontSize: '14px', color: f.text }}><BlurredAmount>{currencySymbol(gig.currency)}{gig.fee?.toLocaleString()}</BlurredAmount></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: aColor(advStatus), flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: aColor(advStatus) }}>{aLabel(advStatus)}</span>
                </div>
              </div>

              {isOpen && (
                <div style={{ background: '#0a0906', border: `1px solid ${f.gold}20`, borderTop: 'none', padding: '18px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                    <button
                      onClick={() => router.push(`/gigs/${gig.id}?edit=true`)}
                      style={{
                        background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                        border: `1px solid ${f.gold}`,
                        color: f.gold, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.16em',
                        textTransform: 'uppercase', padding: '10px 22px', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = f.gold; e.currentTarget.style.color = '#070706' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)'; e.currentTarget.style.color = f.gold }}
                    >Edit gig →</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>

                    {/* DETAILS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `${gig.currency === 'GBP' ? '£' : gig.currency === 'USD' ? '$' : gig.currency === 'CHF' ? 'CHF ' : '€'}${gig.fee?.toLocaleString()}`, blur: true },
                        { l: 'Audience', v: gig.audience?.toLocaleString() },
                      ].map((item: any) => (
                        <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${f.border}`, fontSize: '12px' }}>
                          <span style={{ color: f.dimmer }}>{item.l}</span>
                          <span style={{ color: f.dim }}>{item.blur ? <BlurredAmount>{item.v}</BlurredAmount> : item.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* ADVANCE */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Advance request</div>
                      {advStatus === 'complete' && (
                        <div>
                          <div style={{ fontSize: '13px', color: f.green, marginBottom: '14px' }}>✓ Advance received</div>
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: f.gold, textDecoration: 'none', textTransform: 'uppercase', border: `1px solid ${f.gold}40`, padding: '10px 18px', display: 'inline-block' }}>View advance sheet →</Link>
                        </div>
                      )}
                      {advStatus === 'sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: f.gold, marginBottom: '10px' }}>Sent — awaiting response</div>
                          <button onClick={() => setShowEmailInput(showEmailInput === gig.id ? null : gig.id)} style={{ background: 'transparent', border: `1px solid ${f.border}`, color: f.dimmer, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>Resend</button>
                        </div>
                      )}
                      {(advStatus === 'not_sent' || showEmailInput === gig.id) && (
                        <div>
                          {advStatus === 'not_sent' && !showEmailInput && <div style={{ fontSize: '13px', color: f.dimmer, marginBottom: '14px' }}>No advance sent yet</div>}
                          {showEmailInput === gig.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input value={promoterEmail} onChange={e => setPromoterEmail(e.target.value)} placeholder="promoter@venue.com"
                                style={{ background: f.bg, border: `1px solid ${f.mid}`, color: f.text, fontFamily: f.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => sendAdvance(gig, promoterEmail)} disabled={sending === gig.id || !promoterEmail} style={{ background: promoterEmail ? f.gold : 'transparent', color: promoterEmail ? '#070706' : f.dimmer, border: `1px solid ${promoterEmail ? f.gold : f.border}`, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {sending === gig.id && <ScanPulse size="sm" color="#070706" />}
                                  {sending === gig.id ? 'Sending...' : 'Send →'}
                                </button>
                                <button onClick={() => { setShowEmailInput(null); setPromoterEmail('') }} style={{ background: 'transparent', color: f.dimmer, border: `1px solid ${f.border}`, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setShowEmailInput(gig.id)} style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${f.gold}`, color: f.gold, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer' }}>
                              Send advance request →
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Quick actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                          style={{ fontSize: '12px', color: f.green, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.green}30`, display: 'block' }}>Create post →</Link>
                        <Link href="/contracts" style={{ fontSize: '12px', color: f.dimmer, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.border}`, display: 'block' }}>Upload contract →</Link>
                        <Link href="/business/finances" style={{ fontSize: '12px', color: f.dimmer, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.border}`, display: 'block' }}>View invoices →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: `1px solid ${f.border}`, padding: '16px 24px', fontSize: '13px', color: f.text, zIndex: 9999, backdropFilter: 'blur(16px)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: f.gold, marginBottom: '5px', textTransform: 'uppercase' }}>Gigs</div>
          {toast}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      </div>{/* end inner padding */}
    </div>
  )
}
