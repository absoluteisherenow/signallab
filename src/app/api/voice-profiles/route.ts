import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('artist_profiles')
      .select('name, genre, lowercase_pct, short_caption_pct, no_hashtags_pct, style_rules, data_source, post_count_analysed, last_scanned')
      .not('style_rules', 'is', null)
      .limit(10)

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ voiceProfiles: [] })
      throw error
    }
    return NextResponse.json({ voiceProfiles: data || [] })
  } catch {
    return NextResponse.json({ voiceProfiles: [] })
  }
}
