import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

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
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(isPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              fileContent,
              {
                type: 'text',
                text: `Extract all bank account details from this document. UK bank statements often show BOTH local details (sort code + account number) AND international details (IBAN + BIC/SWIFT) for the same account — extract all of them.

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
No markdown, no explanation. Just the JSON object.`,
              },
            ],
          },
        ],
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      return NextResponse.json({ error: data?.error?.message || 'Extraction failed' }, { status: 502 })
    }

    const rawText: string = data?.content?.[0]?.text ?? ''
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let result: unknown
    try {
      result = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Could not extract details — try entering manually.' }, { status: 422 })
    }

    return NextResponse.json({ success: true, details: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
