import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

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

    // Build content array with the document
    const content: any[] = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64,
        },
      },
      {
        type: 'text',
        text: context || 'Please analyse this document. Extract all key financial data, amounts, dates, and any important details. Be specific with numbers.',
      },
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: response.status })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || 'Could not read document'

    return NextResponse.json({ text, usage: result.usage })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
