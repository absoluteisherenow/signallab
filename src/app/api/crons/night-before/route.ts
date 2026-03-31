import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered daily at 18:00 UTC via Vercel Cron
// For each confirmed/pending gig tomorrow → sends night-before briefing notification + email
export async function GET() {
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

    // Get artist settings for name
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('artist_name')
      .single()
    const artistName = settings?.artist_name || 'Artist'

    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
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
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
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
        sendEmail: true,
      })

      // Also send a richer email if Resend is available
      if (resend && process.env.ARTIST_EMAIL) {
        await resend.emails.send({
          from: 'Artist OS <onboarding@resend.dev>',
          to: process.env.ARTIST_EMAIL,
          subject: `Tomorrow: ${gig.venue} — ${gigDate}`,
          html: `
            <div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:520px">
              <div style="color:#b08d57;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:20px">
                Night Manoeuvres — Tomorrow
              </div>
              <div style="font-size:22px;margin-bottom:4px">${gig.venue}</div>
              <div style="color:#8a8780;font-size:13px;margin-bottom:28px">${gigDate}${timeStr ? ` · ${timeStr}` : ''}</div>
              <table style="border-collapse:collapse;width:100%;margin-bottom:28px">
                <tr><td style="color:#8a8780;font-size:11px;padding:6px 0;border-bottom:1px solid #1a1a18">Set</td><td style="font-size:13px;padding:6px 0;border-bottom:1px solid #1a1a18">${setStatus}</td></tr>
                <tr><td style="color:#8a8780;font-size:11px;padding:6px 0;border-bottom:1px solid #1a1a18">Advance</td><td style="font-size:13px;padding:6px 0;border-bottom:1px solid #1a1a18">${advanceStatus}</td></tr>
                ${gig.promoter_name ? `<tr><td style="color:#8a8780;font-size:11px;padding:6px 0;border-bottom:1px solid #1a1a18">Promoter</td><td style="font-size:13px;padding:6px 0;border-bottom:1px solid #1a1a18">${gig.promoter_name}${gig.promoter_email ? ` · ${gig.promoter_email}` : ''}</td></tr>` : ''}
                ${gig.venue_address ? `<tr><td style="color:#8a8780;font-size:11px;padding:6px 0;border-bottom:1px solid #1a1a18">Address</td><td style="font-size:13px;padding:6px 0;border-bottom:1px solid #1a1a18">${gig.venue_address}</td></tr>` : ''}
              </table>
              ${storyCaption ? `<div style="border:1px solid #2a2a28;padding:16px;margin-bottom:24px"><div style="color:#b08d57;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px">Story caption</div><div style="font-size:16px">${storyCaption}</div></div>` : ''}
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'}/gigs/${gig.id}" style="display:inline-block;background:#b08d57;color:#070706;padding:12px 24px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase">View gig →</a>
            </div>`,
        }).catch(() => {})
      }

      notified++
    }

    return NextResponse.json({ ran: true, notified })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
