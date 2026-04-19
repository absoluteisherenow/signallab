import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { env } from '@/lib/env'
// Resend removed — all outbound goes through approve-before-send

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered daily at 18:00 UTC via Cloudflare cron worker (signal-lab-crons).
// For each confirmed/pending gig tomorrow → sends night-before briefing notification + email.
export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'night-before')
  if (unauth) return unauth

  try {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('date', tomorrowStr)
      .in('status', ['confirmed', 'pending'])

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, notified: 0 })

    // Get artist settings for name and team contacts
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('artist_name, profile, team')
      .single()
    const artistName = settings?.artist_name || settings?.profile?.name || 'Artist'
    const team = (settings?.team || []) as { id?: string; role?: string; name?: string; email?: string; phone?: string }[]
    const contentCrew = team.filter(t =>
      t.email && ['photographer', 'videographer', 'content'].some(r =>
        (t.role || '').toLowerCase().includes(r)
      )
    )

    let notified = 0

    for (const gig of gigs) {
      // Check advance status
      const { data: advance } = await supabase
        .from('advance_requests')
        .select('id, completed')
        .eq('gig_id', gig.id)
        .limit(1)
        .single()
      const advanceStatus = advance ? 'Advance sent ✓' : 'Advance not sent — send now'

      // Check set status
      const { data: linkedSet } = await supabase
        .from('dj_sets')
        .select('id, name')
        .eq('gig_id', gig.id)
        .limit(1)
        .single()
      const setStatus = linkedSet ? `Set ready: "${linkedSet.name}"` : 'No set built — open SetLab'

      // Generate a 1-sentence story caption via Claude
      let storyCaption = ''
      try {
        const apiKey = (await env('ANTHROPIC_API_KEY'))!
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 80,
            messages: [{
              role: 'user',
              content: `Write a single Instagram Story caption for tonight's show. Artist: ${artistName}. Venue: ${gig.venue}. Date: tomorrow. Keep it under 10 words, no hashtags, lowercase, raw and direct.`,
            }],
          }),
        })
        const aiData = await aiRes.json()
        storyCaption = aiData.content?.[0]?.text?.trim() || ''
      } catch {
        // Caption generation failure is non-critical
      }

      const gigDate = new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      const timeStr = gig.slot_time || gig.set_time || ''
      const titleLine = `Tomorrow: ${gig.venue}${timeStr ? ` / ${timeStr}` : ''}`
      const messageLines = [
        setStatus,
        advanceStatus,
        gig.promoter_name ? `Promoter: ${gig.promoter_name}` : '',
        gig.venue_address ? `Venue: ${gig.venue_address}` : '',
        storyCaption ? `Story caption: "${storyCaption}"` : '',
      ].filter(Boolean).join(' · ')

      await createNotification({
        type: 'system',
        title: titleLine,
        message: messageLines,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
        sendSms: true,
      })

      // Content crew briefing — generate draft, text artist for approval
      if (contentCrew.length > 0) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'
        const uploadUrl = `${appUrl}/upload/${gig.id}`

        // Get recent top-performing content for the brief
        let topContent = ''
        try {
          const { data: topPosts } = await supabase
            .from('scheduled_posts')
            .select('caption, likes, comments, engagement_score')
            .eq('status', 'posted')
            .order('engagement_score', { ascending: false })
            .limit(3)
          if (topPosts?.length) {
            topContent = topPosts.map((p, i) =>
              `${i + 1}. ${(p.caption || '').slice(0, 60)}... (${p.likes || 0} likes, ${p.comments || 0} comments)`
            ).join('\n')
          }
        } catch { /* non-critical */ }

        // Generate brief via Claude
        let briefText = ''
        let briefHtml = ''
        try {
          const briefApiKey = (await env('ANTHROPIC_API_KEY'))!
          const briefRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': briefApiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 800,
              messages: [{
                role: 'user',
                content: `Write a short content brief for a photographer/videographer shooting tomorrow's show.

Artist: ${artistName}
Venue: ${gig.venue}
Location: ${gig.location || ''}
Date: ${gigDate}
Set time: ${gig.slot_time || gig.set_time || 'TBC'}
${gig.venue_address ? `Address: ${gig.venue_address}` : ''}

${topContent ? `Top performing content recently:\n${topContent}\n` : ''}
Upload link: ${uploadUrl}

Write the brief as plain text with clear sections. Include:
1. SHOW INFO: venue, date, set time, address
2. WHAT WORKS: based on the top content data (or general electronic music content advice if no data), suggest 3-4 specific shot types/moments to capture
3. REQUIREMENTS: vertical video (9:16) for Stories/Reels, horizontal for feed posts, minimum 1080p, raw files preferred
4. UPLOAD: direct upload link + mention they can also share a Google Drive or Dropbox link by replying to the email
5. Keep it warm, direct, concise. No corporate tone. This is from a fellow creative.

Never mention AI. Output the brief only, no preamble.`,
              }],
            }),
          })
          const briefData = await briefRes.json()
          briefText = briefData.content?.[0]?.text?.trim() || ''
        } catch { /* non-critical */ }

        // Fallback brief if Claude fails
        if (!briefText) {
          briefText = `CONTENT BRIEF: ${gig.venue}\n\n` +
            `Show: ${artistName} at ${gig.venue}\n` +
            `Date: ${gigDate}\n` +
            `Set time: ${gig.slot_time || gig.set_time || 'TBC'}\n` +
            `${gig.venue_address ? `Address: ${gig.venue_address}\n` : ''}\n` +
            `WHAT TO CAPTURE:\n` +
            `- Crowd energy during peak moments\n` +
            `- Behind-the-scenes / soundcheck\n` +
            `- Venue atmosphere and lighting\n` +
            `- Close-ups of the setup / decks\n\n` +
            `REQUIREMENTS:\n` +
            `- Vertical (9:16) for Stories/Reels\n` +
            `- Horizontal for feed posts\n` +
            `- Minimum 1080p, raw files preferred\n\n` +
            `UPLOAD: ${uploadUrl}\n` +
            `Or share a Google Drive / Dropbox link by replying to this email.`
        }

        // Convert to HTML
        briefHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:580px">
          <div style="color:#ff2a1a;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:24px">NIGHT MANOEUVRES — CONTENT BRIEF</div>
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:600">${gig.venue}</h2>
          <p style="color:#909090;margin:0 0 24px;font-size:14px">${gigDate}${gig.slot_time || gig.set_time ? ` / ${gig.slot_time || gig.set_time}` : ''}</p>
          <div style="color:#f2f2f2;font-size:14px;line-height:1.8;white-space:pre-wrap">${briefText}</div>
          <div style="margin-top:32px">
            <a href="${uploadUrl}" style="display:inline-block;background:#ff2a1a;color:#050505;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600">Upload content here &rarr;</a>
          </div>
          <p style="color:#909090;font-size:12px;margin-top:16px">Or reply to this email with a Google Drive / Dropbox link.</p>
          <a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090;text-decoration:none"><svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.4"/><polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a>
        </div>`

        // Save drafts for each crew member
        const draftIds: string[] = []
        for (const member of contentCrew) {
          const { data: draft } = await supabase
            .from('crew_briefing_drafts')
            .insert({
              gig_id: gig.id,
              recipient_name: member.name || null,
              recipient_email: member.email,
              recipient_role: member.role || null,
              subject: `Content brief: ${gig.venue} / ${gigDate}`,
              body_html: briefHtml,
              body_text: briefText,
              upload_url: uploadUrl,
              status: 'draft',
            })
            .select('id')
            .single()
          if (draft) draftIds.push(draft.id)
        }

        // Text artist with brief preview + approval prompt
        const crewNames = contentCrew.map(c => c.name || c.email).join(', ')
        const smsPreview = `CONTENT BRIEF READY\n` +
          `${gig.venue} / ${gigDate}\n` +
          `To: ${crewNames}\n\n` +
          briefText.slice(0, 800) +
          `\n\n---\nReply YES to send, NO to skip.`

        await createNotification({
          type: 'content_review',
          title: `Content brief ready — ${gig.venue}`,
          message: `Brief for ${crewNames}. Review and approve to send.`,
          href: `/gigs/${gig.id}`,
          gig_id: gig.id,
          sendSms: true,
        })

        // Send the detailed SMS with brief content
        try {
          const { sendSms } = await import('@/lib/sms')
          if (process.env.ARTIST_PHONE) {
            await sendSms({ to: process.env.ARTIST_PHONE, body: smsPreview })
          }
        } catch { /* SMS failure non-critical */ }
      }

      notified++
    }

    return NextResponse.json({ ran: true, notified })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Night-before briefing failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
