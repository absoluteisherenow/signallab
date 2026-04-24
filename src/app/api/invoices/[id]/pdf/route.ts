import { NextRequest, NextResponse } from 'next/server'
import { buildInvoicePdf } from '@/lib/invoice-pdf'

// Thin route wrapper — all PDF construction lives in @/lib/invoice-pdf so the
// builder can be shared with /api/invoices/[id]/send (email attachment).
// Exporting the builder from this route file broke the Next.js App Router
// build ("not a valid Route export field") and silently blocked every deploy
// from 2026-04-19 onwards — which was why none of the Meta ads fixes shipped
// until we moved it.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const bytes = await buildInvoicePdf(params.id)
  if (!bytes) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
  const total = bytes.byteLength

  // Some PDF viewers (Chrome, mobile mail previews) byte-range probe large
  // PDFs before streaming — a 200 + full body to a Range request makes them
  // display a broken preview with no retry. Advertise + honour Range.
  const rangeHeader = req.headers.get('range')
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader)
    if (m) {
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : total - 1
      if (start <= end && end < total) {
        const slice = bytes.slice(start, end + 1)
        return new NextResponse(slice as any, {
          status: 206,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, no-store',
          },
        })
      }
    }
  }

  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
    },
  })
}
