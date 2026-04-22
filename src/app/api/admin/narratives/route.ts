// Admin CRUD for narrative_threads. Active threads inject into the brain's
// system prompt as a `do not contradict` block; a soft_flag `threadConsistency`
// check catches literal watch-out hits post-generation.
//
// All operations scope to the authed user's own rows — the RLS policy on the
// table already enforces this, but we belt-and-brace at the API layer too.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = new Set(
    (process.env.ADMIN_EMAILS || process.env.ARTIST_EMAIL || 'absoluteishere@gmail.com')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
  return allow.has(email.toLowerCase())
}

const VALID_TASKS = new Set([
  'caption.instagram',
  'caption.tiktok',
  'caption.threads',
  'release.announce',
  'release.rollout',
  'gig.content',
  'gig.advance',
  'gig.recap',
  'ad.creative',
  'ad.launch',
  'assistant.chat',
  'brief.weekly',
])

function sanitizeApplies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && VALID_TASKS.has(v))
}

function sanitizeStrings(raw: unknown, cap = 20): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()).slice(0, cap)
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { serviceClient: supabase, user } = gate

  const { data, error } = await supabase
    .from('narrative_threads')
    .select('*')
    .eq('user_id', user.id)
    .order('status', { ascending: true })
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ threads: data || [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { serviceClient: supabase, user } = gate

  const body = await req.json().catch(() => ({}))
  if (!body.slug || !body.title || !body.body) {
    return NextResponse.json({ error: 'slug, title, body are required' }, { status: 400 })
  }

  const row = {
    user_id: user.id,
    slug: String(body.slug).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 60),
    title: String(body.title).slice(0, 120),
    body: String(body.body).slice(0, 4000),
    non_negotiables: sanitizeStrings(body.non_negotiables),
    watch_outs: sanitizeStrings(body.watch_outs),
    applies_to: sanitizeApplies(body.applies_to),
    priority: Number.isFinite(body.priority) ? Math.max(0, Math.min(100, Math.round(body.priority))) : 50,
    status: body.status === 'archived' ? 'archived' : 'active',
    mission_id: body.mission_id || null,
  }

  const { data, error } = await supabase.from('narrative_threads').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ thread: data })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { serviceClient: supabase, user } = gate

  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 120)
  if (typeof body.body === 'string') patch.body = body.body.slice(0, 4000)
  if (Array.isArray(body.non_negotiables)) patch.non_negotiables = sanitizeStrings(body.non_negotiables)
  if (Array.isArray(body.watch_outs)) patch.watch_outs = sanitizeStrings(body.watch_outs)
  if (Array.isArray(body.applies_to)) patch.applies_to = sanitizeApplies(body.applies_to)
  if (Number.isFinite(body.priority)) patch.priority = Math.max(0, Math.min(100, Math.round(body.priority)))
  if (body.status === 'active' || body.status === 'archived') {
    patch.status = body.status
    if (body.status === 'archived') patch.ended_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('narrative_threads')
    .update(patch)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ thread: data })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { serviceClient: supabase, user } = gate

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('narrative_threads').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
