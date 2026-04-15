import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('releases')
      .select('*')
      .order('release_date', { ascending: true })

    if (error) {
      // Table doesn't exist yet — return empty gracefully
      if (error.code === '42P01') return NextResponse.json({ releases: [] })
      throw error
    }
    return NextResponse.json({ releases: data || [] })
  } catch {
    return NextResponse.json({ releases: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, artist, type, release_date, label, streaming_url, artwork_url, notes, source } = body
    if (!title || !release_date) {
      return NextResponse.json({ success: false, error: 'Title and release_date required' }, { status: 400 })
    }
    const { data, error } = await supabase.from('releases').insert([{
      title, artist: artist || null, type: type || 'single', release_date, label: label || null,
      streaming_url: streaming_url || null, artwork_url: artwork_url || null,
      notes: notes || null, source: source || 'manual',
      created_at: new Date().toISOString(),
    }]).select()

    if (!error && data?.[0]) {
      await createNotification({
        type: 'content_review',
        title: 'Release campaign ready to plan',
        message: 'New release created — generate a campaign?',
        href: `/releases/${data[0].id}/campaign`,
      })
    }

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          success: false,
          error: 'releases table not found',
          sql: `CREATE TABLE releases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text not null,
  artist text,
  type text default 'single',
  release_date date not null,
  label text,
  streaming_url text,
  notes text,
  source text default 'manual'
);`
        }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ success: true, release: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, title, artist, type, release_date, label, streaming_url, artwork_url, notes } = body
    if (!id || !title || !release_date) {
      return NextResponse.json({ success: false, error: 'id, title, and release_date required' }, { status: 400 })
    }
    const { data, error } = await supabase.from('releases').update({
      title, artist: artist || null, type: type || 'single', release_date, label: label || null,
      streaming_url: streaming_url || null, artwork_url: artwork_url || null, notes: notes || null,
    }).eq('id', id).select()

    if (error) throw error
    return NextResponse.json({ success: true, release: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await supabase.from('releases').delete().eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
