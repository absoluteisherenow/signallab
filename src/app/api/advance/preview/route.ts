import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { gigId, gigTitle, venue, date, promoterEmail, promoterName, artistName, location } = await req.json()

    const isLocal = location && /london|hackney|dalston|shoreditch|brixton|peckham|bermondsey|camden|islington/i.test(location)

    if (!gigId || !gigTitle || !venue || !date || !promoterEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/advance/${gigId}`
    const displayDate = new Date(date).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const artist = artistName || 'Night Manoeuvres'
    const promoter = promoterName || ''

    const systemPrompt = `You write emails for ${artist}, an electronic music artist. Voice: warm, insider tone, mixed case (not all caps), emoji used sparingly as punctuation. Professional but never corporate. You sound like a real person who does this for a living — not a template.

Never mention AI, automation, bots, or anything about how this email was generated. This reads like a hand-written email from the artist or their team.

The email asks the promoter to fill in advance details for an upcoming show. Include all the advance questions INLINE in the email body so the promoter can just hit reply and fill them in. Also include a link to the online form as a backup option.${isLocal ? '\n\nThis is a LOCAL gig (London area) — no need to ask about hotels, transfers, or parking. Keep the questions focused on the essentials: times, tech, and contact info.' : '\n\nThis is an OUT-OF-TOWN gig — travel logistics matter. Make sure hotel, transfer, and parking questions are clearly included.'}

Output valid JSON with exactly these keys:
- "subject": a short, natural subject line
- "body": the email body in plain text with line breaks (used to generate both HTML and plain text versions)

Do NOT wrap in markdown code fences. Output raw JSON only.`

    const userPrompt = `Write an advance request email for this show:

Artist: ${artist}
Show: ${gigTitle}
Venue: ${venue}
Date: ${displayDate}
${promoter ? `Promoter name: ${promoter}` : 'Promoter name: not known'}
Promoter email: ${promoterEmail}

The email should:
1. Open with a warm greeting${promoter ? ` to ${promoter}` : ''}
2. Reference the show naturally
3. Ask them to fill in the advance details below, either by replying to this email or using the online form
4. Include these questions inline, formatted clearly so they can reply directly:

   - Load-in / soundcheck time:
   - Doors time:
   - Set time / set length:${isLocal ? '' : `
   - Parking available?:`}
   - WiFi details (network + password):
   - Dressing room / hospitality:${isLocal ? '' : `
   - Hotel name + address (if being provided):
   - Hotel check-in date + time:
   - Airport/station transfer arranged? (driver name + phone + pickup details):`}
   - Local contact name + phone:
   - Any backline / technical requirements to note:
   - Additional notes:

5. Mention the online form link as a backup: ${formUrl}
6. Close warmly

Keep it concise — promoters are busy. One screen max.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`Claude API error: ${response.status} — ${errBody}`)
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    let parsed: { subject: string; body: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse generated email content')
      }
    }

    // Convert plain text body to HTML email
    const bodyLines = parsed.body.split('\n')
    const htmlBody = bodyLines
      .map((line: string) => {
        if (line.trim() === '') return '<br/>'
        return `<p style="margin:0 0 8px;line-height:1.6">${line}</p>`
      })
      .join('\n')

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:580px">
  <div style="color:#b08d57;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:24px">NIGHT MANOEUVRES — ADVANCE REQUEST</div>
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:600">${gigTitle}</h2>
  <p style="color:#8a8780;margin:0 0 24px;font-size:14px">${venue} &middot; ${displayDate}</p>
  <div style="color:#f0ebe2;font-size:14px;line-height:1.7">
    ${htmlBody}
  </div>
  <div style="margin-top:32px">
    <a href="${formUrl}" style="display:inline-block;background:#b08d57;color:#070706;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600">Complete advance form online &rarr;</a>
  </div>
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1a1917;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Signal Lab OS &middot; Tailored Artist OS &middot; signallabos.com</div>
</div>`

    const plainText = parsed.body + `\n\n---\nOnline form: ${formUrl}\n\nSignal Lab OS — signallabos.com`

    return NextResponse.json({
      subject: parsed.subject,
      html,
      plainText,
    })
  } catch (err: any) {
    console.error('Advance preview error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
