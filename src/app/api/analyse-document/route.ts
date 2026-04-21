import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

export const runtime = 'nodejs'

// User-scoped document/receipt analyser. PDFs + images supported.
// Routed via the brain so per-tenant identity + rules load, even though the
// output is free-text analysis (runPostCheck:false — no voice enforcement
// applies to extracted finance data).
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const context = formData.get('context') as string || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = file.type || 'application/pdf'
    const isImage = mimeType.startsWith('image/')

    const fileBlock = isImage
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        }
      : {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64,
          },
        }

    const result = await callClaudeWithBrain({
      userId,
      task: 'gmail.scan',
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      taskInstruction:
        'You analyse documents (invoices, contracts, receipts, statements) and extract the key financial data, amounts, dates, and any important details. Be specific with numbers.',
      messagesOverride: [{
        role: 'user',
        content: [
          fileBlock,
          { type: 'text', text: context || 'Please analyse this document. Extract all key financial data, amounts, dates, and any important details. Be specific with numbers.' },
        ],
      }],
      runPostCheck: false,
    })

    return NextResponse.json({ text: result.text, usage: result.usage })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
