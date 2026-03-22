import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { platform, caption, format, scheduled_at, status, buffer_post_id, gig_title, media_url } = body

    // Ensure table exists
    // table created via Supabase dashboard

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert([{
        platform,
        caption,
        format: format || 'post',
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: status || 'scheduled',
        buffer_post_id: buffer_post_id || null,
        gig_title: gig_title || null,
        media_url: media_url || null,
      }])
      .select()

    if (error) {
      // Table might not exist yet — create it
      if (error.code === '42P01') {
        return NextResponse.json({ 
          success: false, 
          error: 'scheduled_posts table not found. Run the SQL in Supabase to create it.',
          sql: `CREATE TABLE scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  platform text,
  caption text,
  format text default 'post',
  scheduled_at timestamptz,
  status text default 'scheduled',
  buffer_post_id text,
  gig_title text,
  media_url text
);`
        }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ success: true, post: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .order('scheduled_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, posts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, posts: [] }, { status: 500 })
  }
}
