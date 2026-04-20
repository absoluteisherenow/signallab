import { NextRequest, NextResponse } from 'next/server'
import { buildInvoicePdf } from '@/lib/invoice-pdf'

// Thin route wrapper — all PDF construction lives in @/lib/invoice-pdf so the
// builder can be shared with /api/invoices/[id]/send (email attachment).
// Exporting the builder from this route file broke the Next.js App Router
// build ("not a valid Route export field") and silently blocked every deploy
// from 2026-04-19 onwards — which was why none of the Meta ads fixes shipped
// until we moved it.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const bytes = await buildInvoicePdf(params.id)
  if (!bytes) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
