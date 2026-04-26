import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// ── /api/settings ───────────────────────────────────────────────────────────
// Auth-gated CRUD for the current user's artist_settings row. RLS policies
// (user_owns_row_*) enforce isolation; we still pass user_id explicitly on
// insert because the row is created at first save, not at signup.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const { data, error } = await supabase
      .from('artist_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    // Default empty shape for fresh users — onboarding fills these in.
    const settings = data || {
      profile: { name: '', genre: '', country: '', bio: '', profile_pic_url: '' },
      team: {},
      advance: {},
      payment: {},
      aliases: [],
      promo_list: [],
      default_currency: null,
      tier: 'free',
    }
    if (!settings.aliases) settings.aliases = (settings.profile as any)?.aliases || []
    if (!settings.promo_list) settings.promo_list = []
    if (!settings.team) settings.team = {}

    return NextResponse.json({ success: true, settings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const { profile, team, advance, payment, aliases, promo_list, default_currency } = body

    const { data: existing } = await supabase
      .from('artist_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (profile !== undefined) updates.profile = profile
    if (team !== undefined) updates.team = team
    if (advance !== undefined) updates.advance = advance
    if (payment !== undefined) updates.payment = payment
    if (promo_list !== undefined) updates.promo_list = promo_list
    if (default_currency !== undefined) updates.default_currency = default_currency

    if (aliases !== undefined && updates.profile) {
      (updates.profile as any).aliases = aliases
    } else if (aliases !== undefined) {
      updates.profile = { aliases }
    }

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('artist_settings')
        .update(updates)
        .eq('id', existing.id)
        .select()
      if (error) throw error
      result = data?.[0]
    } else {
      const { data, error } = await supabase
        .from('artist_settings')
        .insert([{
          user_id: user.id,
          profile: { ...(profile || {}), aliases: aliases || [] },
          team: team || {},
          advance: advance || {},
          payment: payment || {},
          default_currency: default_currency || null,
          tier: 'free',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select()
      if (error) throw error
      result = data?.[0]
    }

    return NextResponse.json({ success: true, settings: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
