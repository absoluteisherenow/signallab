'use client'

import { useState, useEffect } from 'react'
import MobileAdvanceSheet from './MobileAdvanceSheet'
import MobileInvoiceSheet from './MobileInvoiceSheet'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  status?: string
  artwork_url?: string
}

interface TravelBooking {
  id: string
  type: string
  name?: string
  flight_number?: string
  from_location?: string
  to_location?: string
  departure_at?: string
  arrival_at?: string
  check_in?: string
  check_out?: string
  reference?: string
}

interface AdvanceReq { gig_id: string; completed?: boolean; sent_at?: string | null; created_at?: string }
interface Invoice { gig_id: string | null; status: string; type?: string }

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#222',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
  green: '#4ecb71',
}
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

type ExpandedData = {
  loading: boolean
  travel: TravelBooking[]
  advance: AdvanceReq[]
  invoices: Invoice[]
  glSlug: string | null
  offersDiscount: boolean
  offersGuestlist: boolean
}

export default function MobileGigs() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedData>>({})
  const [sharing, setSharing] = useState<string | null>(null)
  const [advSheetGigId, setAdvSheetGigId] = useState<string | null>(null)
  const [invSheetGigId, setInvSheetGigId] = useState<string | null>(null)

  async function refreshGigData(gigId: string) {
    try {
      const [advanceR, invoiceR] = await Promise.allSettled([
        fetch(`/api/advance?gigId=${gigId}`).then(r => r.json()),
        fetch(`/api/invoices`).then(r => r.json()),
      ])
      const advance = advanceR.status === 'fulfilled' ? (advanceR.value.requests || []) : []
      const allInvoices = invoiceR.status === 'fulfilled' ? (invoiceR.value.invoices || []) : []
      const invoices: Invoice[] = allInvoices.filter((i: Invoice) => i.gig_id === gigId)
      setExpandedData(d => {
        const cur = d[gigId]
        if (!cur) return d
        return { ...d, [gigId]: { ...cur, advance, invoices } }
      })
    } catch {}
  }

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => {
      setGigs(d.gigs || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const upcoming = gigs
    .filter(g => new Date(g.date) >= now || g.date === today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const past = gigs
    .filter(g => new Date(g.date) < now && g.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))

  async function toggleExpand(gig: Gig) {
    if (expandedId === gig.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(gig.id)
    if (expandedData[gig.id]) return

    setExpandedData(d => ({ ...d, [gig.id]: { loading: true, travel: [], advance: [], invoices: [], glSlug: null, offersDiscount: true, offersGuestlist: true } }))

    try {
      const [travelR, advanceR, invoiceR, glR] = await Promise.allSettled([
        fetch(`/api/gigs/${gig.id}/travel`).then(r => r.json()),
        fetch(`/api/advance?gigId=${gig.id}`).then(r => r.json()),
        fetch(`/api/invoices`).then(r => r.json()),
        fetch(`/api/guest-list`).then(r => r.json()),
      ])
      const travel = travelR.status === 'fulfilled' ? (travelR.value.bookings || []) : []
      const advance = advanceR.status === 'fulfilled' ? (advanceR.value.requests || []) : []
      const allInvoices = invoiceR.status === 'fulfilled' ? (invoiceR.value.invoices || []) : []
      const invoices: Invoice[] = allInvoices.filter((i: Invoice) => i.gig_id === gig.id)
      const glInvites = glR.status === 'fulfilled' ? (glR.value.invites || []) : []
      const existing = glInvites.find((i: any) => i.gig_id === gig.id)
      const glSlug = existing?.slug || null
      const offersDiscount = existing ? existing.offers_discount !== false : true
      const offersGuestlist = existing ? existing.offers_guestlist !== false : true

      setExpandedData(d => ({
        ...d,
        [gig.id]: { loading: false, travel, advance, invoices, glSlug, offersDiscount, offersGuestlist },
      }))
    } catch {
      setExpandedData(d => ({
        ...d,
        [gig.id]: { loading: false, travel: [], advance: [], invoices: [], glSlug: null, offersDiscount: true, offersGuestlist: true },
      }))
    }
  }

  function setOffer(gigId: string, key: 'offersDiscount' | 'offersGuestlist', value: boolean) {
    setExpandedData(prev => {
      const cur = prev[gigId] || { loading: false, travel: [], advance: [], invoices: [], glSlug: null, offersDiscount: true, offersGuestlist: true }
      return { ...prev, [gigId]: { ...cur, [key]: value } }
    })
  }

  async function handleShareGL(gig: Gig) {
    if (sharing) return
    setSharing(gig.id)
    try {
      const current = expandedData[gig.id]
      const offersDiscount = current?.offersDiscount !== false
      const offersGuestlist = current?.offersGuestlist !== false
      if (!offersDiscount && !offersGuestlist) {
        return
      }
      let slug = current?.glSlug || null
      if (!slug) {
        const res = await fetch('/api/guest-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gig_id: gig.id, offers_discount: offersDiscount, offers_guestlist: offersGuestlist }),
        })
        const d = await res.json()
        slug = d?.invite?.slug || null
        if (slug) {
          setExpandedData(prev => ({
            ...prev,
            [gig.id]: { ...(prev[gig.id] || { loading: false, travel: [], advance: [], invoices: [], offersDiscount: true, offersGuestlist: true }), glSlug: slug! },
          }))
        }
      }
      if (!slug) return
      const url = `${window.location.origin}/gl/${slug}`
      const title = `Guest list · ${gig.venue}`
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try { await (navigator as any).share({ url, title }) } catch {}
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } finally {
      setSharing(null)
    }
  }

  return (
    <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: '96px' }}>
      <div style={{ padding: '20px 20px 0', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', color: COLOR.text, textTransform: 'uppercase' }}>
          TOUR
        </div>
      </div>

      <div style={{ padding: '20px 20px 4px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.035em', color: COLOR.text, textTransform: 'uppercase' }}>
          {upcoming.length} UPCOMING
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: COLOR.dimmer, textTransform: 'uppercase', marginTop: 4 }}>
          {past.length} PAST
        </div>
      </div>

      {loading && (
        <div style={{ padding: '40px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.dimmer, textTransform: 'uppercase' }}>
          LOADING
        </div>
      )}

      {!loading && upcoming.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionLabel>UPCOMING</SectionLabel>
          <div>
            {upcoming.map(g => (
              <GigRow
                key={g.id}
                gig={g}
                expanded={expandedId === g.id}
                data={expandedData[g.id]}
                onToggle={() => toggleExpand(g)}
                onShareGL={() => handleShareGL(g)}
                onToggleOffer={(k, v) => setOffer(g.id, k, v)}
                onOpenAdv={() => setAdvSheetGigId(g.id)}
                onOpenInvoice={() => setInvSheetGigId(g.id)}
                sharing={sharing === g.id}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && past.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionLabel>PAST</SectionLabel>
          <div>
            {past.slice(0, 12).map(g => (
              <GigRow
                key={g.id}
                gig={g}
                expanded={expandedId === g.id}
                data={expandedData[g.id]}
                onToggle={() => toggleExpand(g)}
                onShareGL={() => handleShareGL(g)}
                onToggleOffer={(k, v) => setOffer(g.id, k, v)}
                onOpenAdv={() => setAdvSheetGigId(g.id)}
                onOpenInvoice={() => setInvSheetGigId(g.id)}
                sharing={sharing === g.id}
                dim
              />
            ))}
          </div>
        </div>
      )}

      {!loading && gigs.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: COLOR.dimmer }}>
          No gigs yet.
        </div>
      )}

      {advSheetGigId && (
        <MobileAdvanceSheet
          gigId={advSheetGigId}
          onClose={() => setAdvSheetGigId(null)}
          onSent={() => {
            const id = advSheetGigId
            setAdvSheetGigId(null)
            if (id) refreshGigData(id)
          }}
        />
      )}
      {invSheetGigId && (
        <MobileInvoiceSheet
          gigId={invSheetGigId}
          onClose={() => setInvSheetGigId(null)}
          onSent={() => {
            const id = invSheetGigId
            setInvSheetGigId(null)
            if (id) refreshGigData(id)
          }}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '0 20px', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
      color: COLOR.dimmer, textTransform: 'uppercase', marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

function GigRow({
  gig, expanded, data, onToggle, onShareGL, onToggleOffer, onOpenAdv, onOpenInvoice, sharing, dim,
}: {
  gig: Gig
  expanded: boolean
  data: ExpandedData | undefined
  onToggle: () => void
  onShareGL: () => void
  onToggleOffer: (key: 'offersDiscount' | 'offersGuestlist', value: boolean) => void
  onOpenAdv: () => void
  onOpenInvoice: () => void
  sharing: boolean
  dim?: boolean
}) {
  const dateLabel = formatRowDate(gig.date)
  return (
    <div style={{ borderTop: `1px solid ${COLOR.border}`, opacity: dim && !expanded ? 0.55 : 1 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '16px 20px', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          color: COLOR.text, fontFamily: FONT,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: COLOR.red, flexShrink: 0, width: 56 }}>
          {dateLabel}
        </div>
        {gig.artwork_url && (
          <img
            src={gig.artwork_url}
            alt=""
            style={{ height: 48, width: 'auto', maxWidth: 96, objectFit: 'contain', flexShrink: 0, display: 'block' }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
            color: COLOR.text, textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {gig.venue}
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: COLOR.dimmer, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {gig.city}{gig.set_time ? ` · ${gig.set_time}` : ''}
          </div>
        </div>
        <div style={{
          fontSize: 12, color: COLOR.dimmer, flexShrink: 0,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 160ms ease',
        }}>
          ›
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!data || data.loading ? (
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.dimmer, textTransform: 'uppercase', padding: '8px 0' }}>
              LOADING
            </div>
          ) : (
            <>
              {/* GL offers row (only when invite not yet created) */}
              {!data.glSlug && (
                <Row label="OFFER">
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <OfferCheckbox
                      checked={data.offersDiscount !== false}
                      label="DISCOUNT"
                      onChange={v => onToggleOffer('offersDiscount', v)}
                    />
                    <OfferCheckbox
                      checked={data.offersGuestlist !== false}
                      label="GUEST LIST"
                      onChange={v => onToggleOffer('offersGuestlist', v)}
                    />
                  </div>
                </Row>
              )}

              {/* GL */}
              <Row label="GL">
                <Pill
                  onClick={onShareGL}
                  disabled={sharing || (!data.glSlug && data.offersDiscount === false && data.offersGuestlist === false)}
                >
                  {sharing ? 'SHARING' : data.glSlug ? 'SHARE GL' : 'CREATE & SHARE'}
                </Pill>
              </Row>

              {/* Flight */}
              <Row label="FLIGHT">
                {renderFlight(data.travel)}
              </Row>

              {/* Hotel */}
              <Row label="HOTEL">
                {renderHotel(data.travel)}
              </Row>

              {/* Advance */}
              <Row label="ADV">
                <ActionStatusPill
                  text={advanceStatus(data.advance, gig.id)}
                  tone={advanceStatusTone(data.advance, gig.id)}
                  onClick={onOpenAdv}
                />
              </Row>

              {/* Invoice */}
              <Row label="INVOICE">
                <ActionStatusPill
                  text={invoiceStatus(data.invoices)}
                  tone={invoiceStatusTone(data.invoices)}
                  onClick={onOpenInvoice}
                />
              </Row>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 36 }}>
      <div style={{ width: 64, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.dimmer, textTransform: 'uppercase', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, color: COLOR.text, fontSize: 12 }}>
        {children}
      </div>
    </div>
  )
}

function Pill({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent', border: `1px solid ${COLOR.text}`,
        color: COLOR.text,
        padding: '6px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT, opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function OfferCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: FONT, WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        width: 14, height: 14, border: `1px solid ${checked ? COLOR.text : COLOR.dimmest}`,
        background: checked ? COLOR.text : 'transparent',
        display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
        color: checked ? COLOR.text : COLOR.dimmer, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </button>
  )
}

function ActionStatusPill({ text, tone, onClick }: { text: string; tone: 'neutral' | 'ok' | 'warn'; onClick: () => void }) {
  const palette = {
    neutral: { border: COLOR.border, color: COLOR.dimmer },
    warn: { border: COLOR.red, color: COLOR.red },
    ok: { border: COLOR.green, color: COLOR.green },
  }[tone]
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${palette.border}`,
        color: palette.color,
        padding: '4px 8px',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        fontFamily: FONT,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {text}
    </button>
  )
}

function StatusPill({ text, tone }: { text: string; tone: 'neutral' | 'ok' | 'warn' }) {
  const palette = {
    neutral: { border: COLOR.border, color: COLOR.dimmer },
    warn: { border: COLOR.red, color: COLOR.red },
    ok: { border: COLOR.green, color: COLOR.green },
  }[tone]
  return (
    <span style={{
      display: 'inline-block',
      border: `1px solid ${palette.border}`, color: palette.color,
      padding: '4px 8px', fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
      textTransform: 'uppercase',
    }}>
      {text}
    </span>
  )
}

function advanceStatus(reqs: AdvanceReq[], gigId: string): string {
  const req = reqs.find(r => r.gig_id === gigId)
  if (!req) return 'NOT SENT'
  if (req.completed) return 'DONE'
  return 'PENDING'
}
function advanceStatusTone(reqs: AdvanceReq[], gigId: string): 'ok' | 'warn' | 'neutral' {
  const req = reqs.find(r => r.gig_id === gigId)
  if (!req) return 'warn'
  if (req.completed) return 'ok'
  return 'neutral'
}

function invoiceStatus(invoices: Invoice[]): string {
  if (invoices.length === 0) return 'NOT SENT'
  const paid = invoices.every(i => i.status === 'paid')
  if (paid) return 'PAID'
  const anyPending = invoices.some(i => i.status === 'pending' || i.status === 'sent')
  if (anyPending) return 'PENDING'
  return invoices[0].status.toUpperCase()
}
function invoiceStatusTone(invoices: Invoice[]): 'ok' | 'warn' | 'neutral' {
  if (invoices.length === 0) return 'warn'
  if (invoices.every(i => i.status === 'paid')) return 'ok'
  return 'neutral'
}

function renderFlight(travel: TravelBooking[]) {
  const flights = travel.filter(t => (t.type || '').toLowerCase() === 'flight')
  if (flights.length === 0) return <span style={{ color: COLOR.dimmest }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {flights.map(f => (
        <div key={f.id} style={{ fontSize: 12, color: COLOR.text, letterSpacing: '0.02em' }}>
          <span style={{ fontWeight: 700 }}>{f.flight_number || 'FLIGHT'}</span>
          <span style={{ color: COLOR.dimmer }}>
            {' '}{f.from_location || '—'} → {f.to_location || '—'}
          </span>
          {f.departure_at && (
            <span style={{ color: COLOR.dimmest }}> · {formatTravelTime(f.departure_at)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function renderHotel(travel: TravelBooking[]) {
  const hotels = travel.filter(t => (t.type || '').toLowerCase() === 'hotel')
  if (hotels.length === 0) return <span style={{ color: COLOR.dimmest }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {hotels.map(h => (
        <div key={h.id} style={{ fontSize: 12, color: COLOR.text, letterSpacing: '0.02em' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{h.name || 'HOTEL'}</span>
          {h.check_in && <span style={{ color: COLOR.dimmer }}> · {formatTravelDate(h.check_in)}</span>}
        </div>
      ))}
    </div>
  )
}

function formatTravelTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()
  } catch { return '' }
}
function formatTravelDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  } catch { return '' }
}

function formatRowDate(d: string) {
  try {
    const date = new Date(d)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  } catch { return '' }
}
