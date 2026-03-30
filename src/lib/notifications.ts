import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type NotificationType =
  | 'set_time_changed'
  | 'gig_added'
  | 'gig_cancelled'
  | 'advance_sent'
  | 'advance_received'
  | 'invoice_overdue'
  | 'system'

interface CreateNotificationOptions {
  type: NotificationType
  title: string
  message?: string
  href?: string
  gig_id?: string
  metadata?: Record<string, unknown>
  sendEmail?: boolean
}

export async function createNotification(opts: CreateNotificationOptions) {
  const { type, title, message, href, gig_id, metadata, sendEmail } = opts

  // Write to DB
  try {
    await supabase.from('notifications').insert([{
      type,
      title,
      message: message || null,
      href: href || null,
      gig_id: gig_id || null,
      metadata: metadata || null,
      read: false,
    }])
  } catch {
    // Table may not exist yet — fail silently
  }

  // Send email if requested
  if (sendEmail && process.env.RESEND_API_KEY && process.env.ARTIST_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Artist OS <onboarding@resend.dev>',
        to: process.env.ARTIST_EMAIL,
        subject: title,
        html: `
          <div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:520px">
            <div style="color:#b08d57;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:20px">
              Artist OS — ${type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <div style="font-size:18px;margin-bottom:12px">${title}</div>
            ${message ? `<div style="color:#8a8780;font-size:14px;margin-bottom:20px">${message}</div>` : ''}
            ${href ? `<a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'}${href}" style="display:inline-block;background:#b08d57;color:#070706;padding:12px 24px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase">View →</a>` : ''}
          </div>`,
      })
    } catch {
      // Email failure is non-critical
    }
  }
}
