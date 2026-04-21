import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms'

/**
 * Public guest-list endpoints (no auth). Used by /gl/<slug> signup form.
 *
 * GET  /api/gl/[slug]   → { gig, offers_discount, offers_guestlist } (404 if slug unknown)
 * POST /api/gl/[slug]   { name, plus_ones?, response?, email?, phone?, notes? }
 *                       → { success }
 *
 * Lightweight anti-abuse: name required, plus_ones clamped 0–10, fields length-capped.
 * Does not expose the inviting user's id.
 */

const LIMITS = {
  name: 80,
  email: 120,
  phone: 30,
  notes: 300,
  city: 80,
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = (params.slug || '').trim().toLowerCase()
  if (!slug) return NextResponse.json({ error: 'invalid slug' }, { status: 400 })

  const svc = serviceClient()
  const { data: invite } = await svc
    .from('guest_list_invites')
    .select('id, gig_id, offers_discount, offers_guestlist')
    .eq('slug', slug)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: gig } = await svc
    .from('gigs')
    .select('title, date, venue, lineup, artwork_url, ticket_url')
    .eq('id', invite.gig_id)
    .maybeSingle()

  return NextResponse.json({
    gig: gig
      ? {
          title: gig.title || '',
          date: gig.date || '',
          venue: gig.venue || '',
          lineup: gig.lineup || '',
          artwork_url: gig.artwork_url || '',
        }
      : null,
    offers_discount: invite.offers_discount !== false,
    offers_guestlist: invite.offers_guestlist !== false,
  })
}

function clamp(v: any, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function fmtGigDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = (params.slug || '').trim().toLowerCase()
  if (!slug) return NextResponse.json({ error: 'invalid slug' }, { status: 400 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const name = clamp(body.name, LIMITS.name)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const plus_ones = Math.max(0, Math.min(10, Number(body.plus_ones) || 0))
  const allowedResponses = new Set(['coming', 'guestlist', 'maybe'])
  const response = allowedResponses.has(body.response) ? body.response : 'coming'

  const email = clamp(body.email, LIMITS.email)
  const phone = clamp(body.phone, LIMITS.phone)
  const notes = clamp(body.notes, LIMITS.notes)
  const city = clamp(body.city, LIMITS.city)

  const svc = serviceClient()
  const { data: invite } = await svc
    .from('guest_list_invites')
    .select('id, gig_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { error } = await svc
    .from('guest_list_responses')
    .insert({
      invite_id: invite.id,
      name,
      plus_ones,
      response,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      city: city || null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire SMS only for the paid-ticket path. For guest-list requests we hold
  // the SMS until the artist confirms the name — sent from the owner's PATCH
  // on /api/guest-list/[slug]/responses.
  if (phone && response === 'coming') {
    try {
      const { data: gig } = await svc
        .from('gigs')
        .select('venue, date, ticket_url')
        .eq('id', invite.gig_id)
        .maybeSingle()

      const ticketUrl = gig?.ticket_url || ''
      if (ticketUrl) {
        const venue = gig?.venue || 'the show'
        const dateLabel = fmtGigDate(gig?.date || '')
        const where = `${venue} ${dateLabel}`.trim()
        const smsResult = await sendSms({
          to: phone,
          body: `Night Manoeuvres. Discount ticket for ${where}: ${ticketUrl}. See you there.`,
        })
        if (!smsResult.success) console.warn('GL ticket SMS failed:', smsResult.error)
      }
    } catch (e: any) {
      console.warn('GL SMS error:', e?.message || e)
    }
  }

  return NextResponse.json({ success: true })
}
