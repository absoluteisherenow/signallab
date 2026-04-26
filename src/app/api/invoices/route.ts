import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { tierAllowsMultiCurrency, defaultCurrencyForCountry, type SupportedCurrency } from '@/lib/currency'
import { getUserTier } from '@/lib/tier'

// ── /api/invoices ──────────────────────────────────────────────────────────
// Auth-gated CRUD on invoices. RLS policies (user_owns_row_*) keep rows
// scoped to the authed user; we still pass user_id explicitly on insert.
// Currency is locked to the user's default for non-Pro tiers.

async function resolveCurrency(userId: string, supabase: any, requested?: string | null): Promise<SupportedCurrency> {
  const tier = await getUserTier(userId)
  if (tierAllowsMultiCurrency(tier) && requested) return requested as SupportedCurrency
  const { data: settings } = await supabase
    .from('artist_settings')
    .select('default_currency, profile')
    .eq('user_id', userId)
    .maybeSingle()
  if (settings?.default_currency) return settings.default_currency as SupportedCurrency
  return defaultCurrencyForCountry((settings?.profile as any)?.country)
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, invoices: data || [] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, invoices: [] })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const currency = await resolveCurrency(user.id, supabase, body.currency)
    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        user_id: user.id,
        gig_id: body.gig_id || null,
        gig_title: body.gig_title,
        amount: parseFloat(body.amount) || 0,
        currency,
        type: body.type || 'full',
        status: 'pending',
        due_date: body.due_date || null,
        gig_date: body.gig_date || null,
        wht_rate: body.wht_rate || null,
        artist_name: body.artist_name || null,
        notes: body.notes || null,
      }])
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, invoice: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { id } = await req.json()
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const updates: Record<string, any> = {}
    if (body.status) updates.status = body.status
    if (body.status === 'paid') updates.paid_at = new Date().toISOString()
    if (body.currency !== undefined) {
      updates.currency = await resolveCurrency(user.id, supabase, body.currency)
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', body.id)
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, invoice: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
