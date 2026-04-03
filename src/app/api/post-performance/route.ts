import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('post_performance')
      .select('platform, caption, format, actual_likes, actual_comments, estimated_score, context')
      .order('estimated_score', { ascending: false })
      .limit(70)

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ posts: [] })
      throw error
    }
    return NextResponse.json({ posts: data || [] })
  } catch {
    return NextResponse.json({ posts: [] })
  }
}
