import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Public guest-list endpoints (no auth). Used by /gl/<slug> signup form.
 *
 * GET  /api/gl/[slug]   → { gig: { title, date, venue, lineup } } (404 if slug unknown)
 * POST /api/gl/[slug]   { name, plus_ones?, response?, instagram?, email?, phone?, notes? }
 *                       → { success }
 *
 * Lightweight anti-abuse: name required, plus_ones clamped 0–10, fields length-capped.
 * Does not expose the inviting user's id.
 */

const LIMITS = {
  name: 80,
  instagram: 40,
  email: 120,
  phone: 30,
  notes: 300,
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
    .select('id, gig_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: gig } = await svc
    .from('gigs')
    .select('title, date, venue, lineup')
    .eq('id', invite.gig_id)
    .maybeSingle()

  return NextResponse.json({
    gig: gig
      ? { title: gig.title || '', date: gig.date || '', venue: gig.venue || '', lineup: gig.lineup || '' }
      : null,
  })
}

function clamp(v: any, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
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

  const instagram = clamp(body.instagram, LIMITS.instagram).replace(/^@/, '')
  const email = clamp(body.email, LIMITS.email)
  const phone = clamp(body.phone, LIMITS.phone)
  const notes = clamp(body.notes, LIMITS.notes)

  const svc = serviceClient()
  const { data: invite } = await svc
    .from('guest_list_invites')
    .select('id')
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
      instagram: instagram || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
