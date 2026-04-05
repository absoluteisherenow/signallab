import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('artist_settings')
      .select('*')
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    
    // Return default settings if none exist
    const settings = data || {
      profile: { name: 'NIGHT manoeuvres', genre: 'Electronic', country: 'United Kingdom', bio: '', profile_pic_url: '' },
      team: [],
      advance: { sender_name: 'NIGHT manoeuvres Management', reply_email: 'bookings@nightmanoeuvres.com' },
      aliases: [],
    }
    // Ensure arrays always exist — aliases stored inside profile JSONB
    if (!settings.aliases) settings.aliases = settings.profile?.aliases || []
    if (!settings.promo_list) settings.promo_list = []
    
    return NextResponse.json({ success: true, settings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { profile, team, advance, payment, tier, aliases, promo_list } = body

    // Get existing settings to determine if we insert or update
    const { data: existing } = await supabase
      .from('artist_settings')
      .select('id, tier')
      .single()

    let result

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (profile !== undefined) updates.profile = profile
    if (team !== undefined) updates.team = team
    if (advance !== undefined) updates.advance = advance
    if (payment !== undefined) updates.payment = payment
    if (tier !== undefined) updates.tier = tier
    if (promo_list !== undefined) updates.promo_list = promo_list

    // Store aliases inside profile JSONB to avoid missing column issues
    if (aliases !== undefined && updates.profile) {
      (updates.profile as any).aliases = aliases
    } else if (aliases !== undefined) {
      updates.profile = { aliases }
    }

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
          profile: { ...(profile || {}), aliases: aliases || [] },
          team,
          advance,
          payment: payment || {},
          tier: tier || 'free',
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
