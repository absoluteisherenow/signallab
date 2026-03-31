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
                text: `Extract bank account details from this document. Many UK/international bank statements include BOTH local payment details (sort code + account number) AND international SWIFT/IBAN details on the same page.

Return ONLY valid JSON in this format:
{
  "accountName": "<name on account>",
  "bankName": "<bank name>",
  "currency": "<3-letter currency code e.g. GBP, EUR, USD, AUD — infer from IBAN country prefix or bank country>",
  "local": {
    "label": "Local",
    "sortCode": "<sort code or BSB or routing number, null if not present>",
    "accountNumber": "<domestic account number, null if not present>",
    "iban": null,
    "bic": null,
    "intermediaryBic": null
  },
  "international": {
    "label": "International",
    "sortCode": null,
    "accountNumber": null,
    "iban": "<full IBAN, null if not present>",
    "bic": "<BIC/SWIFT code, null if not present>",
    "intermediaryBic": "<intermediary/correspondent BIC — common for AUD/USD, null if not present>"
  }
}

If only ONE set of details exists (e.g. only IBAN, or only sort code), put it in the appropriate section and return null for the other section entirely.
If the document has IBAN but also a sort code and account number, populate BOTH sections.
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
