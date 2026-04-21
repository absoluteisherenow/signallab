import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'
// Resend removed — all outbound goes through approve-before-send

// Service role required: iterates every tenant's gigs and must read/write
// cross-user rows (per-tenant artist_settings, per-tenant notifications).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ArtistSettings = {
  artist_name?: string
  profile?: { name?: string } | null
  team?: { id?: string; role?: string; name?: string; email?: string; phone?: string }[]
}

// Triggered daily at 18:00 UTC via Cloudflare cron worker (signal-lab-crons).
// For each confirmed/pending gig tomorrow → sends night-before briefing notification + email.
//
// Multi-tenant: gigs.user_id routes settings + notifications to the right
// tenant. crew_briefing_drafts has no user_id column yet (pending migration)
// so drafts insert stays tenant-naive — flag is inline at the insert site.
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

    // Per-tenant artist_settings cache. The old code did a bare `.single()`
    // which returned the FIRST tenant's row regardless of whose gig was being
    // processed — a hard cross-tenant leak (wrong artist name, wrong team,
    // wrong crew emails). Lookup-per-gig keyed by gig.user_id fixes it.
    const settingsByUser = new Map<string, ArtistSettings>()
    async function getSettings(userId: string | null | undefined): Promise<ArtistSettings> {
      if (!userId) return { artist_name: 'Artist', profile: {}, team: [] }
      const cached = settingsByUser.get(userId)
      if (cached) return cached
      const { data } = await supabase
        .from('artist_settings')
        .select('artist_name, profile, team')
        .eq('user_id', userId)
        .maybeSingle()
      const resolved: ArtistSettings = data || { artist_name: 'Artist', profile: {}, team: [] }
      settingsByUser.set(userId, resolved)
      return resolved
    }

    let notified = 0

    for (const gig of gigs) {
      const gigOwnerId: string | null = gig.user_id || null
      const settings = await getSettings(gigOwnerId)
      const artistName = settings.artist_name || settings.profile?.name || 'Artist'
      const team = (settings.team || [])
      const contentCrew = team.filter(t =>
        t.email && ['photographer', 'videographer', 'content'].some(r =>
          (t.role || '').toLowerCase().includes(r)
        )
      )
      // Per-tenant SMS target — team roster first, ARTIST_PHONE fallback only
      // if this tenant has no self-phone on file. Once every tenant has their
      // own phone, drop the env fallback.
      const tenantPhone = team.find(t => t.phone && (t.role || '').toLowerCase().includes('artist'))?.phone
        || process.env.ARTIST_PHONE
        || null
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

      // Generate a 1-sentence story caption through the brain — artist
      // identity comes from ctx so we don't need to pass artistName.
      let storyCaption = ''
      if (gigOwnerId) {
        try {
          const result = await callClaudeWithBrain({
            userId: gigOwnerId,
            task: 'gig.content',
            model: 'claude-sonnet-4-6',
            max_tokens: 80,
            userMessage: `Venue: ${gig.venue}. Date: tomorrow.`,
            taskInstruction: 'Write a single Instagram Story caption for tonight\'s show. Under 10 words, no hashtags, lowercase where natural, raw and direct. Output ONLY the caption text.',
            runPostCheck: false,
          })
          storyCaption = result.text.trim()
        } catch {
          // Caption generation failure is non-critical
        }
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
        user_id: gigOwnerId || undefined,
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

        // Get recent top-performing content for the brief.
        // TODO(multi-tenant): scheduled_posts has no user_id column yet; once
        // the migration lands, add `.eq('user_id', gigOwnerId)` so one tenant's
        // top posts don't leak into another tenant's brief.
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

        // Generate brief through the brain
        let briefText = ''
        let briefHtml = ''
        if (gigOwnerId) {
          try {
            const briefResult = await callClaudeWithBrain({
              userId: gigOwnerId,
              task: 'gig.content',
              model: 'claude-sonnet-4-6',
              max_tokens: 800,
              userMessage: `Show: ${gig.venue}
Location: ${gig.location || ''}
Date: ${gigDate}
Set time: ${gig.slot_time || gig.set_time || 'TBC'}
${gig.venue_address ? `Address: ${gig.venue_address}` : ''}

${topContent ? `Top performing content recently:\n${topContent}\n` : ''}
Upload link: ${uploadUrl}`,
              taskInstruction: `Write a short content brief for a photographer/videographer shooting tomorrow's show. Plain text with clear sections:

1. SHOW INFO: venue, date, set time, address
2. WHAT WORKS: based on the top content data (or general electronic music content advice if no data), suggest 3-4 specific shot types/moments to capture
3. REQUIREMENTS: vertical video (9:16) for Stories/Reels, horizontal for feed posts, minimum 1080p, raw files preferred
4. UPLOAD: direct upload link + mention they can also share a Google Drive or Dropbox link by replying to the email

Warm, direct, concise. No corporate tone. This is from a fellow creative. Never mention AI. Output the brief only, no preamble.`,
              runPostCheck: false,
            })
            briefText = briefResult.text.trim()
          } catch { /* non-critical */ }
        }

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

        // Save drafts for each crew member.
        // TODO(multi-tenant): crew_briefing_drafts has no user_id column yet;
        // once migrated, set `user_id: gigOwnerId` here so the review UI and
        // RLS can scope without joining through gigs.
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
          user_id: gigOwnerId || undefined,
          type: 'content_review',
          title: `Content brief ready — ${gig.venue}`,
          message: `Brief for ${crewNames}. Review and approve to send.`,
          href: `/gigs/${gig.id}`,
          gig_id: gig.id,
          sendSms: true,
        })

        // Send the detailed SMS with brief content to THIS tenant, not the
        // global ARTIST_PHONE. Falls back to env only when a tenant's team
        // roster has no artist-phone on file.
        try {
          const { sendSms } = await import('@/lib/sms')
          if (tenantPhone) {
            await sendSms({ to: tenantPhone, body: smsPreview })
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
