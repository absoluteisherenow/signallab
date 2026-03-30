import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    // Convert to base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Call Claude Sonnet with vision
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `You extract expense data from receipt images, screenshots of bank transactions, online order confirmations, or any financial document.

Return ONLY valid JSON with these exact fields:
{
  "description": "vendor name + brief description, max 60 chars",
  "amount": <number, just the total amount paid, no currency symbol>,
  "currency": "GBP|EUR|USD|AUD|other 3-letter code",
  "date": "YYYY-MM-DD or null if unclear",
  "category": "Travel|Accommodation|Equipment|Marketing|Venue|Software|Other",
  "notes": "any useful extra detail, e.g. booking ref, item name, max 80 chars or empty string"
}

Category guidance for a DJ/music artist:
- Travel: flights, trains, Uber, taxis, fuel, parking, car hire
- Accommodation: hotels, Airbnb, hostels
- Equipment: instruments, cables, headphones, hardware, studio gear
- Software: DAW, plugins, subscriptions, cloud storage, apps
- Marketing: promo, design, photography, ads, printing
- Venue: stage fees, room hire, backline
- Other: everything else

If you cannot determine a field with reasonable confidence, use null for dates and amounts, "Other" for category, and your best guess for description.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Extract the expense data from this image.',
            },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Claude API error ${res.status}`)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    const extracted = JSON.parse(text.replace(/```json|```/g, '').trim())

    return NextResponse.json({ success: true, extracted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
