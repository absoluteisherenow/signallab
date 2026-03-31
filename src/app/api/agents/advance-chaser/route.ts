import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered daily at 09:00 via Vercel Cron
// Finds confirmed gigs within 21 days with no advance sent → fires emails automatically
export async function GET() {
  try {
    const today = new Date()
    const in21Days = new Date(today.getTime() + 21 * 86400000)

    // Get all confirmed gigs in the next 21 days
    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('status', 'confirmed')
      .gte('date', today.toISOString().split('T')[0])
      .lte('date', in21Days.toISOString().split('T')[0])

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, chased: 0, message: 'No upcoming confirmed gigs' })

    // Get existing advance requests to exclude already-sent ones
    const gigIds = gigs.map(g => g.id)
    const { data: existing } = await supabase
      .from('advance_requests')
      .select('gig_id')
      .in('gig_id', gigIds)

    const alreadySent = new Set((existing || []).map(r => r.gig_id))

    const toChase = gigs.filter(g => !alreadySent.has(g.id) && g.promoter_email)
    const noEmail = gigs.filter(g => !alreadySent.has(g.id) && !g.promoter_email)
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

    let chased = 0

    for (const gig of toChase) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)
      const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'}/advance/${gig.id}`

      // Send advance email to promoter
      if (resend) {
        await resend.emails.send({
          from: 'NIGHT manoeuvres <onboarding@resend.dev>',
          to: gig.promoter_email,
          subject: `Advance sheet request — ${gig.title} at ${gig.venue}`,
          html: `<div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:520px">
            <div style="color:#b08d57;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:20px">NIGHT MANOEUVRES — ADVANCE REQUEST</div>
            <h2 style="margin:0 0 8px">${gig.title}</h2>
            <p style="color:#8a8780;margin:0 0 24px">${gig.venue} · ${new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p style="color:#f0ebe2;margin:0 0 24px">Show is in ${daysTo} days — please complete the advance form at your earliest convenience.</p>
            <a href="${formUrl}" style="display:inline-block;background:#b08d57;color:#070706;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase">Complete advance form →</a>
            <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1a1917;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Signal Lab OS &middot; Tailored Artist OS &middot; signallabos.com</div>
          </div>`,
        })
      }

      // Record in advance_requests
      await supabase.from('advance_requests').upsert(
        { gig_id: gig.id, promoter_email: gig.promoter_email, completed: false },
        { onConflict: 'gig_id' }
      )

      // In-app notification for the artist
      await createNotification({
        type: 'advance_sent',
        title: `Advance auto-sent — ${gig.title}`,
        message: `${daysTo} days to show · sent to ${gig.promoter_email}`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })

      chased++
    }

    // Notify artist about gigs missing a promoter email
    for (const gig of noEmail) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)
      await createNotification({
        type: 'advance_sent',
        title: `Add promoter email — ${gig.title}`,
        message: `${daysTo} days away · no promoter email on file`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })
    }

    return NextResponse.json({
      ran: true,
      chased,
      missing_email: noEmail.length,
      already_sent: alreadySent.size,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
