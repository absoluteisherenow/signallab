import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'
import { scrubBrandText } from '@/lib/scrubBrandText'

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const { gigId, gigTitle, venue, date, promoterEmail, promoterName, location } = await req.json()

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
    const promoter = promoterName || ''

    const taskInstruction = `You write advance-request emails on behalf of the artist above. The artist name, casing rules, voice, and no-em-dash / no-AI-mention rules all come from the identity + rules blocks — follow them exactly.

The email asks the promoter to fill in advance details for an upcoming show. Tone: warm insider, professional but never corporate, sounds like a real person who does this for a living.${
      isLocal
        ? '\n\nThis is a LOCAL gig (London area). No need to ask about hotels, transfers, or parking. Focus on the essentials: times, tech, and contact info.'
        : '\n\nThis is an OUT-OF-TOWN gig. Travel logistics matter. Hotel, transfer, and parking questions belong here.'
    }

Output valid JSON with exactly these keys (no markdown fences, raw JSON only):
- "subject": short, natural subject line
- "body": email body in plain text with line breaks`

    const userPrompt = `Write a SHORT advance request email for this show:

Show: ${gigTitle}
Venue: ${venue}
Date: ${displayDate}
${promoter ? `Promoter name: ${promoter}` : 'Promoter name: not known'}
Promoter email: ${promoterEmail}

Keep it very short. No inline questions. Just:
1. Warm one-line greeting${promoter ? ` to ${promoter}` : ''}
2. One sentence referencing the show naturally
3. One sentence asking them to fill in advance details at the online form
4. The form link on its own line: ${formUrl}
5. Warm one-line close (e.g. "Cheers," / "Thanks," then sign off with the artist's name exactly as written in identity)

Absolute max 6 short lines of body text plus the link. Promoters are busy. One paragraph, not a list.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'gig.advance',
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      userMessage: userPrompt,
      taskInstruction,
    })

    const text = result.text || ''

    let parsed: { subject: string; body: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse generated email content')
      }
    }

    parsed.subject = scrubBrandText(parsed.subject || '')
    parsed.body = scrubBrandText(parsed.body || '')

    const artistLabel = result.operating_context.artist.name || 'advance request'

    // Convert plain text body to HTML email
    const bodyLines = parsed.body.split('\n')
    const htmlBody = bodyLines
      .map((line: string) => {
        if (line.trim() === '') return '<br/>'
        return `<p style="margin:0 0 8px;line-height:1.6">${line}</p>`
      })
      .join('\n')

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:580px">
  <div style="color:#ff2a1a;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:24px">${artistLabel} . advance request</div>
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:600">${gigTitle}</h2>
  <p style="color:#909090;margin:0 0 24px;font-size:14px">${venue} &middot; ${displayDate}</p>
  <div style="color:#f2f2f2;font-size:14px;line-height:1.7">
    ${htmlBody}
  </div>
  <div style="margin-top:32px">
    <a href="${formUrl}" style="display:inline-block;background:#ff2a1a;color:#050505;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600">Complete advance form online &rarr;</a>
  </div>
  <a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090;text-decoration:none"><svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.4"/><polyline points="12,32 22,32 26,18 32,46 36,26 40,34 44,30 50,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a>
</div>`

    const plainText = parsed.body + `\n\n---\nOnline form: ${formUrl}\n\nPowered by Signal Lab OS . https://signallabos.com/waitlist`

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
