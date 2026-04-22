import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Admin rule surface. Lists the caller's rule_registry rows + any default
// library entries not yet in the registry, so the operator can promote a
// library default into their personal registry (insert) or retire one that
// has stopped serving (set active_until = now).
//
// Scoped to the caller's own user_id — same email gate as other admin
// endpoints so third parties can't learn or alter rules through this path.
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = new Set(
    (process.env.ADMIN_EMAILS || process.env.ARTIST_EMAIL || 'absoluteishere@gmail.com')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  )
  return allow.has(email.toLowerCase())
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { user, serviceClient: sb } = gate

  const [registryRes, libRes] = await Promise.all([
    sb.from('rule_registry')
      .select('id, slug, name, category, severity, applies_to, body, version, source, active_until')
      .eq('user_id', user.id)
      .order('category', { ascending: true })
      .order('slug', { ascending: true }),
    sb.from('default_rule_library')
      .select('slug, name, category, severity, applies_to, body, version, source_ref')
      .order('category', { ascending: true })
      .order('slug', { ascending: true }),
  ])

  const registry = registryRes.data || []
  const library = libRes.data || []
  const registrySlugs = new Set(registry.filter((r: any) => !r.active_until).map((r: any) => r.slug))
  const availableFromLibrary = library.filter((r: any) => !registrySlugs.has(r.slug))

  return NextResponse.json({
    active: registry.filter((r: any) => !r.active_until),
    retired: registry.filter((r: any) => r.active_until),
    library_available: availableFromLibrary,
  })
}

// POST { action: 'promote', slug }     — copy library row into registry
// POST { action: 'retire',  id }       — set active_until = now on registry row
// POST { action: 'restore', id }       — clear active_until on a retired row
// POST { action: 'severity', id, severity } — change severity in place
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { user, serviceClient: sb } = gate

  const body = await req.json().catch(() => ({}))
  const action = body?.action as string | undefined

  if (action === 'promote') {
    const slug = body?.slug as string | undefined
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
    const { data: lib } = await sb.from('default_rule_library').select('*').eq('slug', slug).maybeSingle()
    if (!lib) return NextResponse.json({ error: 'library rule not found' }, { status: 404 })
    const { error } = await sb.from('rule_registry').insert({
      user_id: user.id,
      slug: lib.slug,
      name: lib.name,
      category: lib.category,
      severity: lib.severity,
      applies_to: lib.applies_to,
      body: lib.body,
      check_fn: lib.check_fn || null,
      version: lib.version || 1,
      source: 'admin_promoted',
      source_ref: lib.source_ref || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'retire') {
    const id = body?.id as string | undefined
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await sb.from('rule_registry')
      .update({ active_until: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'restore') {
    const id = body?.id as string | undefined
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await sb.from('rule_registry')
      .update({ active_until: null })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'severity') {
    const id = body?.id as string | undefined
    const severity = body?.severity as string | undefined
    const allowed = new Set(['hard_block', 'soft_flag', 'advisory', 'auto_fix'])
    if (!id || !severity || !allowed.has(severity)) {
      return NextResponse.json({ error: 'id + valid severity required' }, { status: 400 })
    }
    const { error } = await sb.from('rule_registry')
      .update({ severity })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
