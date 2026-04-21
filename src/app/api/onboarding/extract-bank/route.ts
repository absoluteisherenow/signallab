import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// User-scoped bank-details extractor for onboarding + invoice setup.
// Supports PDF bank statements (GA) and image screenshots. Routed via the brain
// so per-tenant identity/rules load; runPostCheck:false because output is pure
// JSON extraction (no voice enforcement applies).
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Use JPEG, PNG, WEBP, or PDF.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const isPdf = file.type === 'application/pdf'

    const fileContent = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } }

    const taskInstruction = `Extract all bank account details from this document. UK bank statements often show BOTH local details (sort code + account number) AND international details (IBAN + BIC/SWIFT) for the same account — extract all of them.

Return ONLY valid JSON with these fields (null if not found):
{
  "accountName": "<recipient name / name on account>",
  "recipientAddress": "<recipient's address>",
  "bankName": "<bank name>",
  "bankAddress": "<bank's address>",
  "currency": "<3-letter currency code e.g. GBP, EUR, USD, AUD — infer from IBAN country prefix or bank country>",
  "sortCode": "<sort code, BSB, or routing number>",
  "accountNumber": "<domestic account number — separate from IBAN>",
  "iban": "<full IBAN>",
  "bic": "<BIC or SWIFT code>",
  "intermediaryBic": "<intermediary or correspondent BIC/SWIFT — common for AUD, USD>"
}
No markdown, no explanation. Just the JSON object.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'invoice.draft',
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      taskInstruction,
      messagesOverride: [{
        role: 'user',
        content: [
          fileContent,
          { type: 'text', text: 'Extract the bank details from this document.' },
        ],
      }],
      runPostCheck: false,
    })

    const rawText = result.text || ''
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let details: unknown
    try {
      details = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Could not extract details — try entering manually.' }, { status: 422 })
    }

    return NextResponse.json({ success: true, details })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
