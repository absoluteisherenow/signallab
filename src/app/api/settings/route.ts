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
      profile: { name: 'NIGHT manoeuvres', genre: 'Electronic', country: 'Australia', bio: '' },
      team: [],
      advance: { sender_name: 'NIGHT manoeuvres Management', reply_email: 'bookings@nightmanoeuvres.com' },
    }
    
    return NextResponse.json({ success: true, settings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { profile, team, advance } = body
    
    // Get existing settings to determine if we insert or update
    const { data: existing } = await supabase
      .from('artist_settings')
      .select('id')
      .single()
    
    let result
    
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('artist_settings')
        .update({ profile, team, advance, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
      
      if (error) throw error
      result = data?.[0]
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('artist_settings')
        .insert([{
          profile,
          team,
          advance,
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
