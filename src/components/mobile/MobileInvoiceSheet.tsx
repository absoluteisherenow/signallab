'use client'

import { useEffect, useState } from 'react'
import { useGatedSend } from '@/lib/outbound'
import {
  SheetShell, LoadingBlock, MetaGrid, ErrorBar, BottomBar, SendButton,
} from './MobileAdvanceSheet'

const COLOR = {
  bg: '#050505',
  border: '#222',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dimmer: '#b0b0b0',
  green: '#4ecb71',
}

interface GigLite {
  id: string
  title?: string
  venue?: string
  location?: string
  date?: string
  promoter_email?: string
  fee?: number
  currency?: string
}

interface Invoice {
  id: string
  gig_id: string | null
  gig_title?: string
  amount?: number
  currency?: string
  type?: string
  status?: string
  due_date?: string
  sent_to_promoter_at?: string | null
  sent_to_promoter_email?: string | null
}

type Phase =
  | 'loading'
  | 'needs_invoice'
  | 'creating'
  | 'preview'
  | 'sending'
  | 'sent'
  | 'readonly'
  | 'error'

function fmtCurrency(currency: string | undefined, amount: number | undefined): string {
  if (amount == null) return '—'
  const c = currency || 'GBP'
  return `${c} ${Number(amount).toLocaleString()}`
}

function fmtDueDate(d: string | undefined): string {
  if (!d) return 'On receipt'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

function invoiceNumber(id: string): string {
  return `INV-${id.slice(-6).toUpperCase()}`
}

export default function MobileInvoiceSheet({
  gigId,
  onClose,
  onSent,
}: {
  gigId: string
  onClose: () => void
  onSent: () => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string>('')
  const [gig, setGig] = useState<GigLite | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [recipient, setRecipient] = useState<string>('')
  const gatedSend = useGatedSend()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [gigRes, invListRes] = await Promise.all([
          fetch(`/api/gigs/${gigId}`).then(r => r.json()),
          fetch(`/api/invoices`).then(r => r.json()),
        ])
        if (cancelled) return
        const g: GigLite | null = gigRes?.gig || null
        setGig(g)
        const list: Invoice[] = invListRes?.invoices || []
        const forGig = list.filter(i => i.gig_id === gigId)
        const unsent = forGig.find(i => !i.sent_to_promoter_at)
        const pick = unsent || forGig[0] || null
        if (pick) {
          setInvoice(pick)
          setRecipient(pick.sent_to_promoter_email || g?.promoter_email || '')
          await loadInvoiceHtml(pick.id, g?.promoter_email)
          if (cancelled) return
          setPhase(pick.sent_to_promoter_at ? 'readonly' : 'preview')
        } else {
          if (!g) {
            setError('Gig not found.')
            setPhase('error')
            return
          }
          if (!g.fee || g.fee <= 0) {
            setError('No fee set on this gig. Add a fee before creating an invoice.')
            setPhase('error')
            return
          }
          setPhase('needs_invoice')
        }
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || 'Failed to load invoice.')
        setPhase('error')
      }
    })()
    return () => { cancelled = true }

    async function loadInvoiceHtml(invoiceId: string, promoterEmail: string | undefined) {
      // GET returns the rendered HTML email preview directly.
      const qs = promoterEmail ? `?to=${encodeURIComponent(promoterEmail)}` : ''
      const res = await fetch(`/api/invoices/${invoiceId}/send${qs}`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null)
        throw new Error(maybeJson?.error || `Preview failed (${res.status})`)
      }
      const html = await res.text()
      setPreviewHtml(html)
    }
  }, [gigId])

  async function createInvoice() {
    if (!gig) return
    setPhase('creating')
    setError('')
    try {
      const gigDate = gig.date ? new Date(gig.date) : null
      const dueDate = gigDate
        ? new Date(gigDate.getTime() - 7 * 86400000).toISOString().split('T')[0]
        : null
      const createRes = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          gig_id: gigId,
          gig_title: gig.title || gig.venue || 'Show',
          amount: gig.fee,
          currency: gig.currency || 'GBP',
          type: 'full',
          gig_date: gig.date || null,
          due_date: dueDate,
        }),
      }).then(r => r.json())
      if (!createRes?.success || !createRes?.invoice) {
        throw new Error(createRes?.error || 'Could not create invoice.')
      }
      const inv: Invoice = createRes.invoice
      setInvoice(inv)
      setRecipient(gig.promoter_email || '')
      const qs = gig.promoter_email ? `?to=${encodeURIComponent(gig.promoter_email)}` : ''
      const res = await fetch(`/api/invoices/${inv.id}/send${qs}`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null)
        throw new Error(maybeJson?.error || `Preview failed (${res.status})`)
      }
      setPreviewHtml(await res.text())
      setPhase('preview')
    } catch (err: any) {
      setError(err?.message || 'Failed to create invoice.')
      setPhase('error')
    }
  }

  async function handleSend() {
    if (!invoice || !recipient) return
    setPhase('sending')
    setError('')
    try {
      const summary = `Invoice ${invoiceNumber(invoice.id)} — ${invoice.gig_title || gig?.venue || 'Show'}`
      const amountLabel = fmtCurrency(invoice.currency, invoice.amount)
      const dueLabel = fmtDueDate(invoice.due_date)
      const result = await gatedSend<{
        to?: string; cc?: string; subject?: string; html?: string
        amount?: string; dueDate?: string; invoiceNumber?: string
      }, { sent?: boolean; to?: string; error?: string; message?: string }>({
        endpoint: `/api/invoices/${invoice.id}/send`,
        previewBody: { to: recipient, mode: 'both' },
        buildConfig: (p) => ({
          kind: 'email',
          summary,
          to: p.to || recipient,
          subject: p.subject,
          html: p.html,
          meta: [
            { label: 'Amount', value: p.amount || amountLabel },
            { label: 'Due', value: p.dueDate || dueLabel },
            { label: 'Ref', value: p.invoiceNumber || invoiceNumber(invoice.id) },
          ],
        }),
      })
      if (!result.confirmed) {
        setPhase('preview')
        if (result.error) setError(result.error)
        return
      }
      if (result.error) {
        setError(result.error)
        setPhase('error')
        return
      }
      if (!result.data?.sent) {
        setError(result.data?.message || 'Gmail (advancingabsolute@gmail.com) is not connected. Connect it in Settings before sending.')
        setPhase('error')
        return
      }
      setPhase('sent')
      setTimeout(() => { onSent() }, 700)
    } catch (err: any) {
      setError(err?.message || 'Network error.')
      setPhase('error')
    }
  }

  const amountLabel = invoice ? fmtCurrency(invoice.currency, invoice.amount) : '—'
  const dueLabel = invoice ? fmtDueDate(invoice.due_date) : '—'
  const ref = invoice ? invoiceNumber(invoice.id) : '—'

  return (
    <SheetShell title="INVOICE" gig={gig} onClose={onClose}>
      {phase === 'loading' && <LoadingBlock label="LOADING" />}

      {phase === 'needs_invoice' && (
        <>
          <div style={{ fontSize: 13, color: COLOR.text, lineHeight: 1.5, marginBottom: 16 }}>
            No invoice exists for this gig yet. Tap below to create a draft using the booking defaults. 50 percent deposit on booking, 50 percent balance 7 days before performance.
          </div>
          <MetaGrid
            rows={[
              { label: 'VENUE', value: gig?.venue || '—' },
              { label: 'FEE', value: gig ? fmtCurrency(gig.currency, gig.fee) : '—' },
              { label: 'TO', value: gig?.promoter_email || '—' },
            ]}
          />
          <BottomBar>
            <SendButton
              label="CREATE DRAFT"
              onClick={createInvoice}
              tone="red"
            />
          </BottomBar>
        </>
      )}

      {phase === 'creating' && <LoadingBlock label="BUILDING DRAFT" />}

      {(phase === 'preview' || phase === 'sending' || phase === 'sent' || phase === 'readonly') && invoice && (
        <>
          <MetaGrid
            rows={[
              { label: 'TO', value: recipient || '—' },
              { label: 'FROM', value: 'advancingabsolute@gmail.com' },
              { label: 'AMOUNT', value: amountLabel },
              { label: 'DUE', value: dueLabel },
              { label: 'REF', value: ref },
              { label: 'TYPE', value: (invoice.type || 'full').toUpperCase() },
              ...(phase === 'readonly' && invoice.sent_to_promoter_at
                ? [{ label: 'SENT', value: new Date(invoice.sent_to_promoter_at).toLocaleString('en-GB') }]
                : []),
              ...(phase === 'readonly' && invoice.status
                ? [{ label: 'STATUS', value: invoice.status.toUpperCase() }]
                : []),
            ]}
          />

          <div style={{ marginTop: 16, padding: 4, background: '#ffffff', border: `1px solid ${COLOR.border}` }}>
            {previewHtml ? (
              <iframe
                title="Invoice preview"
                srcDoc={previewHtml}
                style={{ width: '100%', height: 520, border: 'none', background: '#fff' }}
                sandbox=""
              />
            ) : (
              <div style={{ padding: 20, color: '#050505', fontSize: 12 }}>No preview available.</div>
            )}
          </div>

          {phase !== 'readonly' && (
            <BottomBar>
              <SendButton
                disabled={phase === 'sending' || phase === 'sent' || !recipient}
                onClick={handleSend}
                label={
                  phase === 'sending' ? 'SENDING…'
                  : phase === 'sent' ? 'SENT'
                  : 'SEND'
                }
                tone={phase === 'sent' ? 'ok' : 'red'}
              />
            </BottomBar>
          )}
        </>
      )}

      {phase === 'error' && (
        <>
          <ErrorBar>{error || 'Something went wrong.'}</ErrorBar>
          <BottomBar>
            <SendButton disabled label="SEND" tone="red" onClick={() => {}} />
          </BottomBar>
        </>
      )}
    </SheetShell>
  )
}
