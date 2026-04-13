import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendSms } from '@/lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type NotificationType =
  | 'set_time_changed'
  | 'gig_added'
  | 'gig_cancelled'
  | 'advance_sent'
  | 'advance_received'
  | 'invoice_created'
  | 'invoice_overdue'
  | 'invoice_request'
  | 'payment_received'
  | 'system'

// Money-critical notification types — these get SMS + email by default
const SMS_CRITICAL_TYPES: Set<NotificationType> = new Set([
  'invoice_created',
  'invoice_request',
  'invoice_overdue',
  'payment_received',
  'advance_received',
  'gig_added',
  'gig_cancelled',
])

interface CreateNotificationOptions {
  type: NotificationType
  title: string
  message?: string
  href?: string
  gig_id?: string
  metadata?: Record<string, unknown>
  sendEmail?: boolean
  sendSms?: boolean  // explicit override — if omitted, auto-sends for SMS_CRITICAL_TYPES
}

export async function createNotification(opts: CreateNotificationOptions) {
  const { type, title, message, href, gig_id, metadata, sendEmail } = opts

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

  // 1. Write to DB (in-app notification)
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

  // 2. Send email if requested
  if (sendEmail && process.env.RESEND_API_KEY && process.env.ARTIST_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Signal Lab <notifications@signallabos.com>',
        to: process.env.ARTIST_EMAIL,
        subject: title,
        html: `
          <div style="font-family:monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:520px">
            <div style="color:#ff2a1a;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:20px">
              Signal Lab OS — ${type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <div style="font-size:18px;margin-bottom:12px">${title}</div>
            ${message ? `<div style="color:#8a8780;font-size:14px;margin-bottom:20px">${message}</div>` : ''}
            ${href ? `<a href="${appUrl}${href}" style="display:inline-block;background:#ff2a1a;color:#050505;padding:12px 24px;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase">View →</a>` : ''}
          </div>`,
      })
    } catch {
      // Email failure is non-critical
    }
  }

  // 3. Send SMS for money-critical notifications
  // Auto-send for critical types unless explicitly overridden to false
  const shouldSms = opts.sendSms !== undefined ? opts.sendSms : SMS_CRITICAL_TYPES.has(type)

  if (shouldSms && process.env.ARTIST_PHONE) {
    try {
      // Keep SMS short — 160 chars to avoid multi-part
      const smsBody = `${title}${message ? '\n' + message.slice(0, 80) : ''}${href ? '\n' + appUrl + href : ''}`
      await sendSms({
        to: process.env.ARTIST_PHONE,
        body: smsBody.slice(0, 160),
      })
    } catch {
      // SMS failure is non-critical
    }
  }
}
