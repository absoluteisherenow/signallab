'use client'

import { useEffect, useState } from 'react'

type Invite = { id: string; gig_id: string; slug: string; offers_discount: boolean; offers_guestlist: boolean; created_at: string }
type Response = { id: string; name: string; plus_ones: number; response: string; email?: string; phone?: string; city?: string; notes?: string; instagram?: string; confirmed: boolean; created_at: string }
type Gig = { id: string; title: string; venue: string; date: string }

type Group = { invite: Invite; gig: Gig | null; responses: Response[] }

interface Props {
  s: {
    bg: string; panel: string; border: string; borderMid: string
    gold: string; goldBright: string; text: string; dim: string; dimmer: string; font: string
  }
  mobile: boolean
}

export function GuestListTab({ s, mobile }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [ir, gr] = await Promise.all([
          fetch('/api/guest-list').then(r => r.json()).catch(() => ({ invites: [] })),
          fetch('/api/gigs').then(r => r.json()).catch(() => ({ gigs: [] })),
        ])
        const invites: Invite[] = ir.invites || []
        const gigsList: Gig[] = (gr.gigs || gr || []) as Gig[]
        const gigById = new Map(gigsList.map(g => [g.id, g]))

        const built = await Promise.all(invites.map(async inv => {
          const rr = await fetch(`/api/guest-list/${inv.slug}/responses`).then(r => r.json()).catch(() => ({ responses: [] }))
          return { invite: inv, gig: gigById.get(inv.gig_id) || null, responses: (rr.responses || []) as Response[] }
        }))
        if (!cancelled) setGroups(built)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function toggleConfirmed(slug: string, id: string, confirmed: boolean) {
    try {
      await fetch(`/api/guest-list/${slug}/responses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, confirmed }),
      })
      setGroups(prev => prev.map(g => g.invite.slug !== slug ? g : {
        ...g,
        responses: g.responses.map(r => r.id === id ? { ...r, confirmed } : r),
      }))
    } catch {}
  }

  async function copyLink(slug: string) {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/gl/${slug}`
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        copied = true
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        copied = document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch (err) {
      console.warn('[GuestListTab] copyLink failed:', err)
    }
    if (copied) {
      showToast('Link copied')
    } else {
      showToast('Copy failed — see prompt')
      window.prompt('Copy this link:', url)
    }
  }

  function shareWhatsapp(slug: string, gigTitle?: string) {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/gl/${slug}`
    const label = gigTitle ? `Guest list for ${gigTitle}` : 'Guest list'
    const text = `${label}: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const now = Date.now()
  const filtered = groups
    .filter(g => filter === 'all' || !g.gig || new Date(g.gig.date).getTime() >= now - 1000 * 60 * 60 * 24)
    .sort((a, b) => {
      const da = a.gig ? new Date(a.gig.date).getTime() : 0
      const db = b.gig ? new Date(b.gig.date).getTime() : 0
      return da - db
    })

  const totalResponses = filtered.reduce((n, g) => n + g.responses.length, 0)
  const pending = filtered.reduce((n, g) => n + g.responses.filter(r => !r.confirmed).length, 0)

  return (
    <div style={{ padding: mobile ? '20px 16px 80px' : '32px 48px 80px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '32px', right: '32px', background: '#1a1811', border: `1px solid ${s.gold}`, color: s.gold, padding: '12px 20px', fontSize: '11px', letterSpacing: '0.15em', zIndex: 1000, fontFamily: s.font, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '24px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmer }}>
          <div><span style={{ color: s.text, fontSize: '13px', letterSpacing: '0.04em', marginRight: '6px' }}>{totalResponses}</span>responses</div>
          <div><span style={{ color: pending > 0 ? s.goldBright : s.text, fontSize: '13px', letterSpacing: '0.04em', marginRight: '6px' }}>{pending}</span>pending</div>
          <div><span style={{ color: s.text, fontSize: '13px', letterSpacing: '0.04em', marginRight: '6px' }}>{filtered.length}</span>gigs</div>
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          {(['upcoming', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '8px 16px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font,
              color: filter === f ? s.gold : s.dimmer,
              borderBottom: filter === f ? `1px solid ${s.gold}` : '1px solid transparent',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: s.dim, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ color: s.dim, fontSize: '12px', lineHeight: 1.7, padding: '32px 0' }}>
          No guest lists yet. Share a gig's guest-list link from the gig detail page to start collecting responses.
        </div>
      )}

      {!loading && filtered.map(g => (
        <div key={g.invite.id} style={{ marginBottom: '32px', border: `1px solid ${s.border}`, background: s.panel }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', color: s.text, fontWeight: 500 }}>{g.gig?.title || 'Unknown gig'}</div>
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.08em', marginTop: '4px', textTransform: 'uppercase' }}>
                {g.gig?.venue || ''}{g.gig?.venue && g.gig?.date ? ' · ' : ''}{g.gig?.date ? new Date(g.gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 10px', border: `1px solid ${s.border}` }}>
                {g.responses.length} {g.responses.length === 1 ? 'response' : 'responses'}
              </div>
              <a href={`/gl/${g.invite.slug}`} target="_blank" rel="noopener noreferrer"
                title={typeof window !== 'undefined' ? `${window.location.origin}/gl/${g.invite.slug}` : ''}
                style={{
                  fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase',
                  background: 'transparent', color: s.dim, border: `1px solid ${s.borderMid}`,
                  padding: '6px 12px', cursor: 'pointer', fontFamily: s.font, textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center',
                }}>Preview ↗</a>
              <button onClick={() => copyLink(g.invite.slug)}
                title={typeof window !== 'undefined' ? `Copy ${window.location.origin}/gl/${g.invite.slug}` : 'Copy link'}
                style={{
                  fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase',
                  background: 'transparent', color: s.gold, border: `1px solid ${s.gold}`,
                  padding: '6px 12px', cursor: 'pointer', fontFamily: s.font,
                }}>Copy link</button>
              <button onClick={() => shareWhatsapp(g.invite.slug, g.gig?.title)}
                title="Share on WhatsApp"
                style={{
                  fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase',
                  background: 'transparent', color: s.text, border: `1px solid ${s.borderMid}`,
                  padding: '6px 12px', cursor: 'pointer', fontFamily: s.font,
                }}>Share</button>
            </div>
          </div>

          {g.responses.length === 0 ? (
            <div style={{ padding: '20px', fontSize: '11px', color: s.dimmer, letterSpacing: '0.04em' }}>
              No responses yet.
            </div>
          ) : (
            <div>
              {g.responses.map(r => (
                <div key={r.id} style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr auto' : 'minmax(160px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1fr) 90px 110px',
                  gap: '12px', padding: '14px 20px', borderTop: `1px solid ${s.border}`,
                  alignItems: 'center', fontSize: '12px',
                }}>
                  <div>
                    <div style={{ color: s.text, fontWeight: 500 }}>
                      {r.name}
                      {r.city ? <span style={{ color: s.dimmer, fontWeight: 400, fontSize: '11px', marginLeft: '8px' }}>· {r.city}</span> : null}
                    </div>
                    {mobile && (
                      <div style={{ color: s.dimmer, fontSize: '10px', marginTop: '4px', lineHeight: 1.4 }}>
                        {r.email || ''}{r.email && r.phone ? ' · ' : ''}{r.phone || ''}
                      </div>
                    )}
                    {mobile && (
                      <div style={{ fontSize: '9px', color: s.dimmer, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '4px' }}>
                        {r.response === 'guestlist' ? 'Guest list' : 'Discount ticket'}
                      </div>
                    )}
                  </div>
                  {!mobile && <div style={{ color: s.dim, fontSize: '11px' }}>{r.email || ''}</div>}
                  {!mobile && <div style={{ color: s.dim, fontSize: '11px' }}>{r.phone || ''}</div>}
                  {!mobile && (
                    <div style={{ fontSize: '9px', color: s.dimmer, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {r.response === 'guestlist' ? 'Guest list' : 'Discount'}
                    </div>
                  )}
                  <button onClick={() => toggleConfirmed(g.invite.slug, r.id, !r.confirmed)} style={{
                    fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '6px 10px', cursor: 'pointer', fontFamily: s.font,
                    background: r.confirmed ? s.gold : 'transparent',
                    color: r.confirmed ? '#050505' : s.dim,
                    border: `1px solid ${r.confirmed ? s.gold : s.border}`,
                  }}>
                    {r.confirmed ? 'Confirmed' : 'Confirm'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
